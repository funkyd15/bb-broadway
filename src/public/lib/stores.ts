
import { orders } from "@wix/ecom";
import { bulkSaveSets } from "./data-utilities";
import { wixAppIds } from "./utilities";
import { getUKTaxYear, TaxYearFormat ,config} from "./utilities";

const anaylticsCollection = "storesAnalytics";
const limit = 100;

export async function queryStoresOrders(startDate: Date, endDate: Date, statusState: Function) {
    statusState("Running queryStoresOrders...");

    let allItems = [];

    function updateStatus(page?: Number) {
        statusState(`Page: ${page}, (${allItems.length})`);
    }

    async function parseAndSaveOrders(items: orders.Order[]) {
        let parsedItems = [];
        items.forEach(i => {
            try {

                const storesLineItems = i.lineItems?.filter(n => n.catalogReference?.appId === wixAppIds.wixStores);
                const bookingsLineItems = i.lineItems?.filter(n => n.catalogReference?.appId === wixAppIds.wixBookings);
                const couponCodes = i.appliedDiscounts ? i.appliedDiscounts?.map(i => i.coupon?.code) : [];

                const createdDate = i._createdDate;
                const createdDateYYYYMMDD = createdDate.toISOString().split("T")[0];

                if (storesLineItems && storesLineItems?.length > 0) {
                //after discount
                const storesLineItemsAmount = storesLineItems.reduce(
                    (accumulator, currentItem) => accumulator + Number(currentItem.lineItemPrice?.amount || 0),
                    0,
                );
                const storesLineItemsDiscount = storesLineItems.reduce(
                    (accumulator, currentItem) => accumulator + Number(currentItem.totalDiscount?.amount|| 0),
                    0,
                );

                const shippingAmount = Number(i.priceSummary?.shipping?.amount) || 0;
                const refundedAmount = Number(i.balanceSummary?.refunded?.amount) || 0;

                const amountReceived = shippingAmount + storesLineItemsAmount - refundedAmount;

                const parsedItem = {
                    _id: i._id,
                    createdDate: createdDateYYYYMMDD,
                    taxYear: getUKTaxYear(createdDate, TaxYearFormat.Year),
                    taxQuarter: getUKTaxYear(createdDate, TaxYearFormat.Quarter),
                    taxMonth: getUKTaxYear(createdDate, TaxYearFormat.Month),
                    orderNumber: i.number,
                    link: `https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/ecom-platform/order-details/${i._id}`,
                    couponCodes,
                    paymentStatus: i.paymentStatus,
                    channelInfoType: i.channelInfo?.type,
                    email: i.buyerInfo?.email,
                    storesLineItemsAmount,
                    storesLineItemsDiscount,
                    shippingAmount,
                    additionalFees: Number(i.priceSummary?.totalAdditionalFees?.amount),
                    amountReceived: amountReceived,
                    item: config.includeItem ? i : undefined,
                    storesLineItems:config.includeItem ?storesLineItems:undefined,
                    bookingsLineItems:config.includeItem ?bookingsLineItems:undefined,
                }
                parsedItems.push(parsedItem);
                }
            } catch (error) {
                console.error("i error", error, i);

            }
            
        });

        allItems.push(...parsedItems);
    }

    const filter = {
        "paymentStatus": { "$in": ["PAID", "PARTIALLY_REFUNDED"] },
        "$and": [{
            "createdDate": {
                "$gte": startDate
            }
        },
        {
            "createdDate": {
                "$lte": endDate
            }
        }
        ]
    }

    let page = 0;
    const search = { filter, cursorPaging: { limit: limit } }
    let response: orders.SearchOrdersResponse = await orders.searchOrders(search);
    // console.log(response);
    updateStatus(page);
    await parseAndSaveOrders(response.orders);

    while (response.metadata?.hasNext) {
        page++;
        const cursorQuery = { cursorPaging: { cursor: response.metadata?.cursors?.next, limit: limit } }
        // query.cursorPaging.cursor = response.pagingMetadata.cursors.next;
        response = await orders.searchOrders(cursorQuery);
        updateStatus(page);
        await parseAndSaveOrders(response.orders);

    }

    statusState(`Saving: ${allItems.length}`)

    await bulkSaveSets(allItems, anaylticsCollection,statusState);

    return allItems;

} 
