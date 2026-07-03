
import { orders, guests, wixEventsV2 } from "@wix/events";
import { bulkSaveSets } from "./data-utilities";
import { wixAppIds } from "./utilities";
import { getUKTaxYear, TaxYearFormat ,config} from "./utilities";

const anaylticsCollection = "eventsAnalytics";
const limit = 100;

export async function queryEventsOrders(startDate: Date, endDate: Date, statusState: Function) {
    statusState("Running queryEventsOrders...");



    let allItems = [];
    function updateStatus(page?: Number) {
        statusState(`Page: ${page}, (${allItems.length})`);
    }

    async function parseAndSaveOrders(guests: guests.EventGuest[]) {
        const orderNumbers = guests.map(i => i.orderNumber);
        const eventIds = guests.map(i => i.eventId);


        const eventsResponse = await wixEventsV2.queryEvents({
            filter: {
                "_id": { "$in": eventIds }
            },
            paging: { limit: 400 },
        }, {
            fields: ["DETAILS"]
        });

        console.log(eventsResponse);
        const eventItems = eventsResponse.events;
        
        
        const options = { orderNumber: orderNumbers, limit: 400, fieldset: ["DETAILS", "INVOICE", "TICKETS"] }
        const response = await orders.listOrders(options);
        console.log({ orderNumbers });
        
        console.log({ guestOrders: response.orders });
        
        const allowableStatus =  ["PAID", "PARTIALLY_REFUNDED"];
        const items = await response.orders;
        // const items = await response.orders?.filter(n=>allowableStatus.includes(n?.status));

        let parsedItems = [];
        items.forEach(i => {
            const createdDate = i.created;
            const createdDateYYYYMMDD = createdDate.toISOString().split("T")[0];
            const findEvent = eventItems.find(n => n._id === i.eventId);
            const eventTitle = (findEvent?.title || "--BLANK--").trim();

            const parsedItem = {
                _id: i.reservationId,
                createdDate: createdDateYYYYMMDD,
                taxYear: getUKTaxYear(createdDate, TaxYearFormat.Year),
                taxQuarter: getUKTaxYear(createdDate, TaxYearFormat.Quarter),
                taxMonth: getUKTaxYear(createdDate, TaxYearFormat.Month),
                orderNumber: i.orderNumber,
                tickets: i.tickets,
                ticketsQuantity: i.ticketsQuantity,
                event: config.includeItem ? findEvent : undefined,
                eventTitle: eventTitle,
                title: eventTitle,
                email: i.email,
                amountReceived: Number(i.invoice?.revenue?.value),
                couponCode: i.invoice?.discount?.discounts[0]?.coupon?.code,
                link:findEvent?._id ? `https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/events/event/${findEvent?._id}/orders/${i.orderNumber}` : undefined,
                paymentStatus: i.status,
              item: config.includeItem ? i : undefined,
            }
            parsedItems.push(parsedItem);

        });

        allItems.push(...parsedItems);
    }

    const filter = {
        // "status": { "$in": ["PAID", "PARTIALLY_REFUNDED"] },
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
    let response: guests.QueryEventGuestsResponse = await guests.queryGuests(query, { fields: ["GUEST_DETAILS", "TICKET_DETAILS"] });
    // console.log(response);
    updateStatus(page);
    await parseAndSaveOrders(response.guests);

    while (response.pagingMetadata?.cursors?.next) {
        page++;
        const cursorQuery = { cursorPaging: { cursor: response.pagingMetadata?.cursors?.next, limit: limit } }
        // query.cursorPaging.cursor = response.pagingMetadata.cursors.next;
        response = await guests.queryGuests(cursorQuery);
        updateStatus(page);
        await parseAndSaveOrders(response.guests);

    }

    console.log(allItems.length);


    statusState(`Saving: ${allItems.length}`)

    await bulkSaveSets(allItems, anaylticsCollection,statusState);

    return allItems;

} 
