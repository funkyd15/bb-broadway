
import { orders } from "@wix/ecom";
import { items as wixData } from '@wix/data';
import { bulkSaveSets } from "./data-utilities";
import { wixAppIds } from "./utilities";
import { getUKTaxYear, TaxYearFormat, config } from "./utilities";

const anaylticsCollection = "storesAnalytics";
const limit = 100;

export async function queryStoresOrders(startDate: Date, endDate: Date, statusState: Function) {
    statusState("Running queryStoresOrders...");

    let allItems: any[] = [];

    function updateStatus(page?: Number) {
        statusState(`Page: ${page}, (${allItems.length})`);
    }

    async function parseAndSaveOrders(items: orders.Order[]) {

        items.forEach((order: orders.Order) => {
            let parsedItems = [];
            try {
                const orderId = order._id;
                const orderNumber = order.number;
                const createdDate = order._createdDate;
                const createdDateYYYYMMDD = createdDate.toISOString().split("T")[0];

                const storesLineItems = order.lineItems?.filter(n => n.catalogReference?.appId === wixAppIds.wixStores) || [];
                const bookingsLineItems = order.lineItems?.filter(n => n.catalogReference?.appId === wixAppIds.wixBookings) || [];
                const couponCodes = order.appliedDiscounts ? order.appliedDiscounts?.map(i => i.coupon?.code) : [];

                //after discount
                const storesLineItemsAmount = storesLineItems.reduce(
                    (accumulator, currentItem) => accumulator + Number(currentItem.lineItemPrice?.amount || 0),
                    0,
                );
                const storesLineItemsDiscount = storesLineItems.reduce(
                    (accumulator, currentItem) => accumulator + Number(currentItem.totalDiscount?.amount || 0),
                    0,
                );

                const shippingAmount = Number(order.priceSummary?.shipping?.amount) || 0;
                const orderAmountRefunded = Number(order.balanceSummary?.refunded?.amount) || 0;
                const reduceRefundQuantity = storesLineItems.reduce(
                    (accumulator, currentItem) => accumulator + Number(currentItem.refundQuantity || 0),
                    0,
                );
                const orderAmount = shippingAmount - (order.paymentStatus === "PARTIALLY_REFUNDED" && reduceRefundQuantity === 0 ? orderAmountRefunded : 0);

                const rootParsedItem = {
                    orderId,
                    createdDate: createdDateYYYYMMDD,
                    taxYear: getUKTaxYear(createdDate, TaxYearFormat.Year),
                    taxQuarter: getUKTaxYear(createdDate, TaxYearFormat.Quarter),
                    taxMonth: getUKTaxYear(createdDate, TaxYearFormat.Month),
                    orderNumber: order.number,
                    link: `https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/ecom-platform/order-details/${order._id}`,
                    paymentStatus: order.paymentStatus,
                    channelInfoType: order.channelInfo?.type,
                    email: order.buyerInfo?.email,
                }

                const parsedOrderItem = {
                    _id: orderId,
                    type: "ORDER",
                    name: "ORDER",
                    title: "ORDER",
                    couponCodes,
                    couponCode:couponCodes.join(";"),
                    storesLineItemsAmount,
                    storesLineItemsDiscount,
                    shippingAmount,
                    amountReceived: rootParsedItem.channelInfoType === "WIX_INVOICES" ? 0 : orderAmount,
                    amount: orderAmount,
                    orderAdditionalFees: Number(order.priceSummary?.totalAdditionalFees?.amount),
                    orderAmountRefunded,
                    // item: config.includeItem ? order : undefined,
                    item: order,
                    storesLineItems: config.includeItem ? storesLineItems : undefined,
                    bookingsLineItems: config.includeItem ? bookingsLineItems : undefined,
                }

                if (storesLineItems && storesLineItems?.length > 0) {
                    parsedItems.push({ ...rootParsedItem, ...parsedOrderItem });
                    //root order: shipping + non booking fees?
                    storesLineItems.forEach((lineItem, index) => {
                        const _id = `${orderId}-${lineItem._id}`;
                        const lineItemIndex = index.toString().padStart(4, "0");
                        const lineItemOrderIndex = `${orderNumber}-${lineItemIndex}`;
                        const lineItemAmount = Number(lineItem.lineItemPrice?.amount || 0);
                        const lineItemPrice = Number(lineItem.price?.amount || 0);
                        const lineItemDiscount = Number(lineItem.totalDiscount?.amount || 0);
                        let lineItemAmountRefunded = 0;
                        if (lineItem.refundQuantity) {
                            lineItemAmountRefunded = lineItemPrice * lineItem.refundQuantity;
                        }
                        const lineItemAmountSubtotal = lineItemAmount - lineItemAmountRefunded;

                        let parsedLineItem = {
                            _id,
                            name: lineItem.productName?.original,
                            title: lineItem.productName?.original,
                            lineItemId: lineItem._id,
                            lineItemOrderIndex,
                            type: "LINE_ITEM",
                            amountReceived: rootParsedItem.channelInfoType === "WIX_INVOICES" ? 0 : lineItemAmountSubtotal,
                            amount:lineItemAmountSubtotal,
                            lineItem,
                            lineItemAmount,
                            lineItemAmountSubtotal,
                            lineItemDiscount,
                            lineItemAmountRefunded,
                        }
                        parsedItems.push({ ...rootParsedItem, ...parsedLineItem });

                    });

                }
            } catch (error) {
                console.error("order error", error, order);

            }

            allItems.push(...parsedItems);
        });

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

    const wixInvoiceItems = allItems.filter(i => i.channelInfoType === "WIX_INVOICES");
    const removeLeadingZeros = (str: string) => str.replace(/^0+/, "") || "0";

    if (wixInvoiceItems.length > 0) {
        const wixInvoiceIds = wixInvoiceItems.map(i => i.orderId);
        let allInvoiceItems = [];
        let invoiceResults = await wixData.query('invoices').hasSome('_id', wixInvoiceIds).limit(1000).find();
        allInvoiceItems.push(...invoiceResults.items);
        while (invoiceResults.hasNext()) {
            invoiceResults = await invoiceResults.next();
            allInvoiceItems.push(...invoiceResults.items);
        }
        allItems.forEach(item => {
            if (item.channelInfoType === "WIX_INVOICES") {
                let findInvoice = allInvoiceItems.find(i => i._id === item.orderId);
                if (findInvoice) {
                    item.invoiceNumber = removeLeadingZeros(findInvoice.number)
                }
            }
        });
    }



    statusState(`Saving: ${allItems.length}`);

    console.log("Stores All Items", allItems);


    await bulkSaveSets(allItems, anaylticsCollection, statusState);

    return allItems;

} 
