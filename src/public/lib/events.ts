
import { orders, guests, wixEventsV2 } from "@wix/events";
import { bulkSaveSets } from "./data-utilities";
import { wixAppIds } from "./utilities";
import { getUKTaxYear, TaxYearFormat, config } from "./utilities";

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
            fields: ["DETAILS", "CATEGORIES"]
        });

        // console.log(eventsResponse);
        const eventItems = eventsResponse.events;


        const options = { orderNumber: orderNumbers, limit: 400, fieldset: ["DETAILS", "INVOICE", "TICKETS"] }
        const response = await orders.listOrders(options);
        console.log({ orderNumbers });

        console.log({ guestOrders: response.orders });

        const allowableStatus = ["PAID", "PARTIALLY_REFUNDED"];
        const items = await response.orders;
        // const items = await response.orders?.filter(n=>allowableStatus.includes(n?.status));

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

        function extractYear(str: string) {
            return str.match(/\b\d{4}\b/)?.[0] || "";
        }

        function extractSeason(str: string) {
            return str.match(/\b(Spring|Summer|Autumn|Winter)\b/i)?.[0] || "";
        }

        const eventMainCategories = [{
            "name": "Camps",
            "_id": "acf8b434-5ad2-4f4d-9744-fda8ae10ddd1",
        },
        {
            "name": "Other",
            "_id": "d5e9e34b-b08d-40ac-b68f-1cf1f7e74719",
        }]


        let parsedItems = [];
        items.forEach(i => {
            const createdDate = i.created;
            const createdDateYYYYMMDD = createdDate.toISOString().split("T")[0];
            const findEvent = eventItems.find(n => n._id === i.eventId);
            const eventTitle = (findEvent?.title || "--BLANK--").trim();
            const location = (findEvent?.location?.name || "--BLANK--").trim();
            const locationFormatted = (findEvent?.location?.address?.formatted || "--BLANK--").trim();
            const serviceType = serviceTypesMapping.find(m =>
                eventTitle.toLowerCase().includes(m.findText)
            )?.output || "Other";

            let mainCategory;
            try {

                const eventCategories = findEvent?.categories?.categories.map(c => c._id) || [];
                eventMainCategories.forEach(eventMainCategory => {
                    if (eventCategories.includes(eventMainCategory._id)) {
                        mainCategory = eventMainCategory.name;
                    }
                });
            } catch (error) {
                //
            }
            try {

                if (!mainCategory) {
                    if (eventTitle.toLowerCase().includes("camp")) {
                        mainCategory = "Camps"
                    }
                }
            } catch (error) {
                //
            }

            if (!mainCategory) {
                mainCategory = "Other"
            }

            const year = extractYear(eventTitle);
            const term = extractSeason(eventTitle);

            const parsedItem = {
                _id: i.reservationId,
                createdDate: createdDateYYYYMMDD,
                taxYear: getUKTaxYear(createdDate, TaxYearFormat.Year),
                taxQuarter: getUKTaxYear(createdDate, TaxYearFormat.Quarter),
                taxMonth: getUKTaxYear(createdDate, TaxYearFormat.Month),
                orderNumber: i.orderNumber,
                tickets: i.tickets,
                ticketsQuantity: i.ticketsQuantity,
                eventTitle: eventTitle,
                title: eventTitle,
                email: i.email,
                amountReceived: Number(i.invoice?.revenue?.value),
                couponCode: i.invoice?.discount?.discounts[0]?.coupon?.code,
                link: findEvent?._id ? `https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/events/event/${findEvent?._id}/orders/${i.orderNumber}` : undefined,
                paymentStatus: i.status,
                item: config.includeItem ? i : undefined,
                event: config.includeItem ? findEvent : undefined,
                // event: findEvent,
                // item: i,
                location,
                parseLocation: location,
                locationFormatted,
                term: term || "--BLANK--",
                year: year || "--BLANK--",
                termYear: [year, term].filter(Boolean).join(" ") || "--BLANK--",
                serviceType:serviceType||"Other",
                mainCategory,

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

    await bulkSaveSets(allItems, anaylticsCollection, statusState);

    return allItems;

} 
