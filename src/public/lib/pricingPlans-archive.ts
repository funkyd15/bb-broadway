// import { orders } from "@wix/pricing-plans";
// import { items as wixData } from '@wix/data';
// import { bulkSaveSets, sumAmountReceived } from "./data-utilities";
// import { getUKTaxYear, TaxYearFormat, config } from "./utilities";
// import { contacts } from "@wix/crm";
// import { httpClient } from "@wix/essentials";
// import { appInstances } from "@wix/app-management";

// const anaylticsCollection = "pricingPlanAnalytics";
// const limit = 50;

// export async function queryPricingPlans(startDate: Date, endDate: Date, statusState: Function) {
//     console.log("V4.2");
    
//   try {
//       const baseApiUrl = new URL(import.meta.url).origin;
  
//    const transactionsResponse = await httpClient.fetchWithAuth(
//       `${baseApiUrl}/api/getPricingPlanTransactions?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
//       , {
//       method:"GET",
//     });
  
//     console.log("transactionItems",await transactionsResponse.json());
//     //
//   } catch (error) {
//     console.error(error);
    
//   }
//   return
//       await wixData.truncate(anaylticsCollection);

//     let allItems: any[] = [];

//     function updateStatus(status?: String) {
//         statusState(status);
//     }

//     async function parseAndSavePricingPlans(items: orders.Order[]) {

//         let parsedItems = [];
//         items.forEach((i: any) => {
//             const cycles = i.cycles || [];
//             const lastestCycleIndex = cycles.slice(-1)[0].index;

//             cycles.forEach((cycle: any) => {
//                 const cycleIndex = cycle.index;
//                 const createdDate = cycle.startedDate;
//                 const createdDateYYYYMMDD = createdDate.toISOString().split("T")[0];

//                 const planStartDate = i.startDate;
//                 const planEndDate = i.endDate;

//                 let amountReceived = Number(i.priceDetails.total);
//                 let cycleStatus = "ACTIVE";
//                 const subscriptionId = i.subscriptionId;
//                 const _id = `${i._id}-${cycleIndex.toString().padStart(4, '0')}`;

//                 const cyclesLength = cycles.length;
//                 if (cycleIndex === lastestCycleIndex && i.lastPaymentStatus !== "PAID") {
//                     amountReceived = 0;
//                     cycleStatus = i.lastPaymentStatus;
//                 }

//                 const parsedItem = {
//                     _id,
//                     subscriptionId,
//                     orderId: i._id,
//                     createdDate: createdDateYYYYMMDD,
//                     taxYear: getUKTaxYear(createdDate, TaxYearFormat.Year),
//                     taxQuarter: getUKTaxYear(createdDate, TaxYearFormat.Quarter),
//                     taxMonth: getUKTaxYear(createdDate, TaxYearFormat.Month),
//                     link: `https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/subscriptions/${subscriptionId}`,
//                     planName: i.planName,
//                     planStatus: i.status,
//                     planStartDate,
//                     planEndDate,
//                     planLastPaymentStatus: i.lastPaymentStatus,
//                     amountReceived,
//                     planCyclesLength: cyclesLength,
//                     cycleStatus,
//                     cycleIndex,
//                     //    order: config.includeOrder ? findOrder : undefined,
//                     // item: config.includeItem ? i : undefined,
//                     buyerContact: i.buyer?.contactId,
//                     item: i,

//                 }
//                 parsedItems.push(parsedItem);

//             });

//         });

//         allItems.push(...parsedItems);
//     }

//     const filter = {
//         "status": "CONFIRMED",
//         "$and": [{
//             "createdDate": {
//                 "$gte": startDate
//             }
//         },
//         {
//             "createdDate": {
//                 "$lte": endDate
//             }
//         }
//         ]
//     }

//     let page = 0;
//     const query = { filter, cursorPaging: { limit: limit } }
//     // const query = { filter, paging: { limit: 100,offset:0 } }
//     let options = { fieldSet: "FULL", offset: (page * limit) }
//     let response = await orders.managementListOrders(options);
//     console.log("orders.managementListOrders", response);
//     updateStatus(`Page: ${page}, (${allItems.length}/${response.pagingMetadata?.total})`);
//     await parseAndSavePricingPlans(response.orders);

//     while (response.pagingMetadata?.hasNext) {
//         page++;
//         options.offset = (page * limit);
//         response = await orders.managementListOrders(options);
//         updateStatus(`Page: ${page}, (${allItems.length}/${response.pagingMetadata?.total})`);
//         await parseAndSavePricingPlans(response.orders);

//     }

//     if (allItems.length > 0) {
//         try {
//             const contactsLimit = 80;
//             const contactIds: string[] = allItems
//                 .map(i => i.buyerContact)
//                 .filter(Boolean);

//             if (contactIds.length > 0) {
//                 let contactsQuery = {
//                     filter: {
//                         _id: { $in: contactIds }
//                     },
//                     paging: {
//                         limit: contactsLimit,
//                         offset: 0
//                     }
//                 };

//                 let contactsPage = 0;
//                 let allContactItems: contacts.Contact[] = [];
//                 let contactsResponse: contacts.QueryContactsResponse = await contacts.queryContacts(contactsQuery);
//                 console.log("contactsResponse", contactsResponse);


//                 allContactItems.push(...contactsResponse.contacts);

//                 while (contactsResponse.pagingMetadata?.hasNext) {
//                     contactsPage++
//                     contactsQuery.paging.offset = (contactsPage * contactsLimit)
//                     contactsResponse = contacts.QueryContactsResponse = await contacts.queryContacts(contactsQuery);
//                     allContactItems.push(...contactsResponse.contacts);
//                 }

//                 console.log("contactsResponse", allContactItems);



//                 allItems.forEach(i => {
//                     const findContact = allContactItems?.find(
//                         c => c._id === i.buyerContact
//                     );

//                     i.email = findContact?.primaryEmail?.email;

//                 });
//             }
//         } catch (error) {
//             console.error("contacts", error);
//         }
//     }


//     statusState(`Saving: ${allItems.length}`)

//     await bulkSaveSets(allItems, anaylticsCollection, statusState);

//     return allItems;
// }