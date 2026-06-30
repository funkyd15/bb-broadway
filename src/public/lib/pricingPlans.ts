import { orders } from "@wix/pricing-plans";
import { items as wixData } from '@wix/data';
import { bulkSaveSets, sumAmountReceived } from "./data-utilities";
import { getUKTaxYear, TaxYearFormat, config } from "./utilities";
import { contacts } from "@wix/crm";
import { httpClient } from "@wix/essentials";
import { appInstances } from "@wix/app-management";

const anaylticsCollection = "pricingPlanAnalytics";
const limit = 50;

export async function queryPricingPlans(startDate: Date, endDate: Date, statusState: Function) {

    const transactionLimit = 1000;
    let allItems: any[] = [];

    function updateStatus(status?: String) {
        statusState(status);
    }

    async function getPricingPlanTransactions(offset: string) {
        try {
            const baseApiUrl = new URL(import.meta.url).origin;

            const transactionsResponse = await httpClient.fetchWithAuth(
                `${baseApiUrl}/api/getPricingPlanTransactions?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&offset=${offset}&includeRefunds=true`
                , {
                    method: "GET",
                });

            return await transactionsResponse.json()
        } catch (error) {
            console.error(error);
        }

        return [];

    }

    var control = true;
    var offset = 0;

    while (control) {
        updateStatus(`${allItems.length}`)
        let items = await getPricingPlanTransactions(offset.toString());
        offset += transactionLimit;
        if (items.length === 0) {
            control = false;
        } else {
            allItems.push(...items)
        }
    }

    
    if (allItems.length > 0) {
        try {
            const contactsLimit = 80;
            const contactIds: string[] = allItems
                .map(i => i.buyerContact)
                .filter(Boolean);

            if (contactIds.length > 0) {
                let contactsQuery = {
                    filter: {
                        _id: { $in: contactIds }
                    },
                    paging: {
                        limit: contactsLimit,
                        offset: 0
                    }
                };

                let contactsPage = 0;
                let allContactItems: contacts.Contact[] = [];
                let contactsResponse: contacts.QueryContactsResponse = await contacts.queryContacts(contactsQuery);
                console.log("contactsResponse", contactsResponse);


                allContactItems.push(...contactsResponse.contacts);

                while (contactsResponse.pagingMetadata?.hasNext) {
                    contactsPage++
                    contactsQuery.paging.offset = (contactsPage * contactsLimit)
                    contactsResponse = contacts.QueryContactsResponse = await contacts.queryContacts(contactsQuery);
                    allContactItems.push(...contactsResponse.contacts);
                }

                console.log("contactsResponse", allContactItems);



                allItems.forEach(i => {
                    const findContact = allContactItems?.find(
                        c => c._id === i.buyerContact
                    );

                    i.email = findContact?.primaryEmail?.email;
                    i.title = i.planName;

                });
            }
        } catch (error) {
            console.error("contacts", error);
        }
    }


    statusState(`Saving: ${allItems.length}`)

    await bulkSaveSets(allItems, anaylticsCollection, statusState);

    return allItems;
}