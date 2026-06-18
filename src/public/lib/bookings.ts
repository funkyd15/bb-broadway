import { extendedBookings, services } from "@wix/bookings";
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
        const
            orderIds = [...new Set(items
                .map((i: any) => i.order?._id)
                .filter(Boolean))];
        // console.log(orderIds);


        const ordersResponse = await orders.searchOrders({
            filter: {
                "_id": { "$in": orderIds },
            }
            , cursorPaging: { limit: limit }
        }
        );
        const orderItems = ordersResponse.orders;

        const serviceIds = [...new Set(items
            .map((i: any) => i.booking?.bookedEntity?.slot?.serviceId)
            .filter(Boolean))];


        //WARNING: Service will be the current price...not the historical price
        const serviceResponse = await services.queryServices({
            filter: {
                "_id": { "$in": serviceIds },
            }
            , paging: { limit: limit }
        }
        );

        // console.log("serviceResponse", serviceResponse, serviceIds);

        const serviceItems = serviceResponse.services;

        // console.log({ ordersResponse });


        let parsedItems = [];
        items.forEach((i: any) => {
            const findOrder = orderItems?.find(n => n._id === i.order?._id);
            const findService = serviceItems?.find(n => n._id === i.booking?.bookedEntity?.slot?.serviceId);

            const paymentStatus = i.booking?.paymentStatus;

            let amount = i.order?.bookingPrice?.amount ? Number(i.order?.bookingPrice?.amount) : 0;
            let membershipBenefitValue = 0;
            let discount = 0;
            if (findOrder) {

                const findOrderLineItem = findOrder.lineItems?.find(n => n?._id === i.order?.lineItemId);
                if (findOrderLineItem) {
                    amount = Number(findOrderLineItem?.price?.amount) || 0;
                    discount = Number(findOrderLineItem?.totalDiscount?.amount) || 0;
                }
            }

            
            
            const singleClassFees = findOrder?.additionalFees?.filter(f => f.code === "single-class-fees") || [];
            const additionalFeesAmount = singleClassFees.length > 0 ? Number(singleClassFees[0].price?.amount) : 0
            
            const amountReceived = paymentStatus === "REFUNDED" || paymentStatus === "NOT_PAID" ? 0 : amount + additionalFeesAmount - discount;
            
            const createdDate = i.booking?._createdDate;
            const createdDateYYYYMMDD = createdDate.toISOString().split("T")[0];
            
            const serviceTitle = i.booking?.bookedEntity?.title || "";
            
            const selectedPaymentOption = i.booking?.selectedPaymentOption;
            
            if (selectedPaymentOption === "MEMBERSHIP" ||selectedPaymentOption ==="MEMBERSHIP_OFFLINE"){
                if(findService){
                    membershipBenefitValue = Number(findService.payment?.fixed?.price?.value) || 0;
                }
                if(membershipBenefitValue===0){
                    //default membershipBenefitValue = 10
                    membershipBenefitValue = 10;
                }
         
            }

            const serviceTypesMapping = [
                { findText: "baby and me", output: "Baby and Me" },
                { findText: "tiny stars", output: "Tiny Stars" },
                { findText: "little stars", output: "Little Stars" },
                { findText: "rising stars", output: "Rising Stars" },
                { findText: "future stars", output: "Future Stars" },
                { findText: "toddler and me", output: "Toddler and Me" },
                { findText: "the ensemble", output: "The Ensemble" },
                { findText: "big top circus", output: "Big Top Circus" },
                { findText: "creative craft", output: "Creative Craft" }
            ];

            const serviceType = serviceTypesMapping.find(m =>
                serviceTitle.toLowerCase().includes(m.findText)
            )?.output || "";

            function extractYear(str: string) {
                return str.match(/\b\d{4}\b/)?.[0] || "";
            }

            function extractSeason(str: string) {
                return str.match(/\b(Spring|Summer|Autumn|Winter)\b/i)?.[0] || "";
            }

            const year = extractYear(serviceTitle);
            const term = extractSeason(serviceTitle);

            function extractVenue(str: string) {
                try {
                    return str.replace(/,\s*\d{1,2}(?::\d{2})?\s*(am|pm)?\s*$/i, "").trim();
                } catch (error) {
                    return str
                }
            }

            const location = i.booking?.bookedEntity?.slot?.location.name || i.booking?.bookedEntity?.schedule?.location?.name;
            const parseLocation = extractVenue(location);


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
                teacher: i.booking?.bookedEntity?.slot?.resource?.name|| "--BLANK--",
                location:location|| "--BLANK--",
                parseLocation:parseLocation|| "--BLANK--",
                serviceTitle:serviceTitle|| "--BLANK--",
                serviceType:serviceType|| "--BLANK--",
                term:term|| "--BLANK--",
                termYear: [term, year].filter(Boolean).join(" ") || "--BLANK--",
                amount,
                discount,
                couponCodes: findOrder?.appliedDiscounts?.map(n => n.coupon?.code),
                amountReceived,
                membershipBenefitValue,
                selectedPaymentOption,
                email: i.booking?.contactDetails?.email,
                order: config.includeOrder ? findOrder : undefined,
                service: config.includeOrder ? findService : undefined,
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
        // console.log(page, response.pagingMetadata?.hasNext);

    }

    statusState(`Saving: ${allItems.length}`)

    await bulkSaveSets(allItems, anaylticsCollection, statusState);

    return allItems;

} 