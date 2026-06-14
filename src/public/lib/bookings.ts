import { extendedBookings } from "@wix/bookings";
import { orders } from "@wix/ecom";
import { bulkSaveSets } from "./data-utilities";
import { getUKTaxYear, TaxYearFormat, config } from "./utilities";

const anaylticsCollection = "bookingsAnalytics";
const limit = 100;

export async function queryExtendedBookings(startDate: Date, endDate: Date, statusState: Function) {
    statusState("Running queryExtendedBookings...");

    let allItems = [];

    function updateStatus(page?: Number) {
        statusState(`Page: ${page}, (${allItems.length})`);
    }

    async function parseAndSaveBookings(items) {
        const orderIds = items
            .map((i: any) => i.order?._id)
            .filter(Boolean);
        // console.log(orderIds);


        const ordersResponse = await orders.searchOrders({
            filter: {
                "_id": { "$in": orderIds },
            }
            , cursorPaging: { limit: limit }
        }
        );

        const orderItems = ordersResponse.orders;

        // console.log({ ordersResponse });


        let parsedItems = [];
        items.forEach((i: any) => {
            const findOrder = orderItems?.find(n => n._id === i.order?._id);

            const paymentStatus = i.booking?.paymentStatus;

            let amount = i.order?.bookingPrice?.amount ? Number(i.order?.bookingPrice?.amount) : 0;
            let discount = 0;
            if (findOrder) {

                const findOrderLineItem = findOrder.lineItems?.find(n => n?._id === i.order?.lineItemId);
                if(findOrderLineItem){
                    amount = Number(findOrderLineItem?.price?.amount) || 0;
                    discount = Number(findOrderLineItem?.totalDiscount?.amount) || 0;
                }
            }


            const singleClassFees = findOrder?.additionalFees?.filter(f => f.code === "single-class-fees") || [];
            const additionalFeesAmount = singleClassFees.length > 0 ? Number(singleClassFees[0].price?.amount) : 0

            const amountReceived = paymentStatus === "REFUNDED" ? 0 : amount + additionalFeesAmount - discount;

            const createdDate = i.booking?._createdDate;
            const createdDateYYYYMMDD = createdDate.toISOString().split("T")[0];

            const parsedItem = {
                _id: i.booking?._id,
                createdDate: createdDateYYYYMMDD,
                taxYear: getUKTaxYear(createdDate, TaxYearFormat.Year),
                taxQuarter: getUKTaxYear(createdDate, TaxYearFormat.Quarter),
                taxMonth: getUKTaxYear(createdDate, TaxYearFormat.Month),
                orderNumber: i.order?.number,
                additionalFees: findOrder?.additionalFees,
                additionalFeesAmount,
                link: `https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/ecom-platform/order-details/${i.order?._id}`,
                paymentStatus,
                teacher: i.booking?.bookedEntity?.slot?.resource?.name,
                location: i.booking?.bookedEntity?.slot?.location.name,
                serviceTitle: i.booking.bookedEntity.title,
                amount,
                discount,
                couponCodes:findOrder?.appliedDiscounts?.map(n=>n.coupon?.code),
                amountReceived,
                selectedPaymentOption: i.selectedPaymentOption,
                order: config.includeOrder ? findOrder : undefined,
                item: config.includeItem ? i : undefined,

            }
            parsedItems.push(parsedItem);
        });

        allItems.push(...parsedItems);
    }

    const filter = {
        "status": "CONFIRMED",
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
    const query = { filter, cursorPaging: { limit: limit } }
    // const query = { filter, paging: { limit: 100,offset:0 } }
    const options = { withBookingFeeDetails: true, withEcomOrder: true }
    let response = await extendedBookings.queryExtendedBookings(query, options);
    // console.log(response);
    updateStatus(page);
    await parseAndSaveBookings(response.extendedBookings);

    while (response.pagingMetadata?.hasNext) {
        page++;
        const cursorQuery = { cursorPaging: { cursor: response.pagingMetadata.cursors.next, limit: limit } }
        // query.cursorPaging.cursor = response.pagingMetadata.cursors.next;
        response = await extendedBookings.queryExtendedBookings(cursorQuery, options);
        updateStatus(page);
        await parseAndSaveBookings(response.extendedBookings);
        console.log(page, response.pagingMetadata?.hasNext);

    }

    statusState(`Saving: ${allItems.length}`)

    await bulkSaveSets(allItems, anaylticsCollection);

    return allItems;

} 