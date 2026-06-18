import { items } from '@wix/data';
import { YYYYMMDD } from './utilities';

export async function bulkSaveSets(array: any[], collection: string, statusState: Function) {
    let bulkSets = [];
    let makeSet = [];
    array = await translateValues(array);

    for (let i = 0; i < array.length; i++) {
        let item = array[i];
        if (getObjectSizeInKB(makeSet.concat(item)) > 1000 || makeSet.length === 1000) {
            bulkSets.push(makeSet.slice());
            makeSet = [];
        }
        makeSet.push(item);
    }
    bulkSets.push(makeSet.slice());

    let sets = bulkSets.length;
    for (let i = 0; i < bulkSets.length; i++) {
        statusState(`Saving (${i + 1}/${sets})`);
        try {
            await items.bulkSave(collection, bulkSets[i]);
        } catch (error) {
            console.log(error);
            try {
                console.log(`Retrying Saving Set: ${i + 1}`);
                await items.bulkSave(collection, bulkSets[i]);
            } catch (error) {
                console.log(error);
                console.log(`Error Saving Set: ${i + 1}`);
            }
        }
    }
}

function getObjectSizeInKB(obj: any) {
    // Convert the object to a JSON string
    const jsonString = JSON.stringify(obj);

    // Calculate the byte size of the JSON string
    const byteSize = new TextEncoder().encode(jsonString).length;

    // Convert bytes to kilobytes
    const kbSize = Number((byteSize / 1024).toFixed(2));

    return kbSize;
}

async function translateValues(array: any[]) {
    const results = await items
        .query('analyticsValueTranslations')
        .ne('toValue', undefined)
        .ne('fromValue', undefined)
        .ne('fieldKey', undefined)
        .find();

    for (const translation of results.items ?? []) {
        for (const item of array) {
            const value = item[translation.fieldKey];

            if (
                typeof value === "string" &&
                value.trim() === translation.fromValue
            ) {
                item[translation.fieldKey] = translation.toValue;
            }
        }
    }

    return array;
}
// export async function sumAmountReceived(collection: string, startDate: string, endDate: string) {

//     let allItems = [];
//     let results = await items.query(collection).ge('createdDate', startDate).le('createdDate', endDate)
//         .limit(1000)
//         .find();

//     for (var i = 0; i < results.items.length; i++) {
//         allItems.push(results.items[i]);

//     }

//     while (results.hasNext()) {
//         results = await results.next();


//         for (var j = 0; j < results.items.length; j++) {
//             allItems.push(results.items[j]);

//         }
//     }

//     const sumReceived = allItems.reduce(
//         (accumulator, currentItem) => accumulator + currentItem.amountReceived,
//         0,
//     );

//     // console.log({sumReceived});

//     return sumReceived;

// }

export async function sumAmountReceived(collection: string, startDate: string, endDate: string) {

    const filter = items
        .filter()
        .ge('createdDate', startDate)
        .le('createdDate', endDate);

    const results = await items
        .aggregate(collection)
        .filter(filter)
        .sum('amountReceived')
        .descending('amountReceivedSum')
        .run();

    // console.log("sumAmountReceived", results);

    return results.items[0]?.amountReceivedSum || 0;

}

export async function aggregateCollectionWithMembershipValue(
    collection: string,
    startDate: string,
    endDate: string,
    group: string,
): Promise<any[]> {

    const [amountSumAggResults, membershipBenefitSumAggResults ] = await Promise.all(
        [
            aggregateCollection(collection, startDate, endDate, group, 'amountReceived'),
            aggregateCollection(collection, startDate, endDate, group, 'membershipBenefitValue'),
        ]
    )
    // console.log("aggregateCollectionWithMembershipValue",membershipBenefitSumAggResults,amountSumAggResults);

    amountSumAggResults.forEach(a => {
        const findMembership = membershipBenefitSumAggResults.find(i => i._id === a._id);
        // console.log(findMembership);

        const membershipBenefitValueSum = findMembership?.membershipBenefitValueSum || 0;
        a.membershipBenefitValueSum = membershipBenefitValueSum;
        a.amountAndMembershipValueSum = membershipBenefitValueSum + a.amountReceivedSum;
    });


    return amountSumAggResults;

}


export async function aggregateCollection(
    collection: string,
    startDate: string,
    endDate: string,
    group?: string,
    sum?: string,
): Promise<any[]> {
    if (!sum) { sum = 'amountReceived' };
    // console.log(sum);

    let allItems = [];
    const filter = items
        .filter()
        .ge('createdDate', startDate)
        .le('createdDate', endDate);

    let agg = items
        .aggregate(collection)
        .filter(filter)
        .sum(sum)
        .descending('amountReceivedSum')
        .limit(1000)
    if (group) {
        agg = agg.group(group)
    }

    let results = await
        agg.run();

    allItems.push(...results.items)

    // console.log(results);
    while (results.hasNext()) {
        results = await results.next();
        allItems.push(...results.items)

    }

    return allItems as any[];

}

export async function aggregateBookingsServiceLocation(
    startDate: string,
    endDate: string,
): Promise<any[]> {
    let allItems = [];
    const filter = items
        .filter()
        .ge('createdDate', startDate)
        .le('createdDate', endDate);

    let agg = items
        .aggregate('bookingsAnalytics')
        .filter(filter)       
        .ascending('serviceType')
        .descending('amountReceivedSum')
        .group('serviceType', 'parseLocation')
        .limit(1000)

    let resultsAmount = await agg.sum('amountReceived').run();
    
    allItems.push(...resultsAmount.items)
    
    // console.log(results);
    while (resultsAmount.hasNext()) {
        resultsAmount = await resultsAmount.next();
        allItems.push(...resultsAmount.items)
    }

    let resultsBenefit = await agg.sum('membershipBenefitValue').run();
    allItems.push(...resultsBenefit.items)

    // console.log("resultsBenefit", resultsBenefit);
      while (resultsBenefit.hasNext()) {
        resultsBenefit = await resultsBenefit.next();
        allItems.push(...resultsBenefit.items)
    }

     allItems = combineArrayByKey(allItems,"_id");

    // console.log("aggregateBookingsServiceLocation", allItems);

    return allItems as any[];
}


export async function aggregateAnalyticsCollections(
    collections: string[],
    startDate: string,
    endDate: string,
    group: string,
) {
    //take mutliple CMS, aggreate by tax year/quarter and reduce sum into a 'single combined' result
    const promises = collections.map(i =>
        // aggregateCollection(i, startDate, endDate, group)
        aggregateCollectionWithMembershipValue(i, startDate, endDate, group)
    );



    const results = await Promise.all(promises);

    // console.log("aggregateAnalyticsCollections", results);


    const combineResults = combineResultsByKey(
        results,
        group,
    );


    // console.log("aggregateAnalyticsCollections", combineResults);

    //descending
    combineResults.sort(function (a, b) {
        const sortKey = group;
        if (a[sortKey] < b[sortKey]) { return 1; }
        if (a[sortKey] > b[sortKey]) { return -1; }
        return 0;
    })

    return combineResults;
}

type AnyRecord = Record<string, any>;

// function combineByKey<T extends AnyRecord>(
//     data: T[][],
//     groupKey: keyof T,
//     valueKey: keyof T
// ) {
//     const map = new Map<string, number>();

//     for (const collection of data) {
//         for (const item of collection) {
//             const key = String(item[groupKey]);
//             const value = Number(item[valueKey]) || 0;

//             map.set(key, (map.get(key) ?? 0) + value);
//         }
//     }

//     return Array.from(map.entries()).map(([key, sum]) => ({
//         [groupKey]: key,
//         [valueKey]: sum,
//     })) as T[];
// }
function combineResultsByKey<T extends AnyRecord>(
    data: T[][],
    groupKey: keyof T
): T[] {
    const map = new Map<string, Partial<T>>();

    for (const collection of data) {
        for (const item of collection) {
            const key = String(item[groupKey]);

            if (!map.has(key)) {
                map.set(key, { ...item });
                continue;
            }

            const existing = map.get(key)!;

            for (const prop in item) {
                if (prop === groupKey) continue;

                const value = item[prop];

                if (typeof value === "number") {
                    existing[prop as keyof T] =
                        (((existing[prop as keyof T] as number | undefined) ?? 0) +
                            value) as T[keyof T];
                }
            }
        }
    }

    return Array.from(map.values()) as T[];
}

// type AnyRecord = Record<string, unknown>;

function combineArrayByKey<T extends AnyRecord>(
    items: T[],
    groupKey: keyof T
): T[] {
     const map = new Map<string, T>();

    for (const item of items) {
        const key = JSON.stringify(item[groupKey]);

        const existing = map.get(key);

        if (!existing) {
            map.set(key, { ...item });
            continue;
        }

        for (const [prop, value] of Object.entries(item)) {
            if (typeof value === 'number') {
                existing[prop] = (existing[prop] ?? 0) + value;
            }
        }
    }

    return [...map.values()];
}

export async function getCreatedDateRange(collection: string): Promise<string> {
    try {
        const [oldestResult, newestResult] = await Promise.all([
            items.query(collection).ascending('createdDate').limit(1).find(),
            items.query(collection).descending('createdDate').limit(1).find(),
        ]);

        const oldestDate = oldestResult.items?.[0]?.createdDate;
        const newestDate = newestResult.items?.[0]?.createdDate;

        if (!oldestDate || !newestDate) {
            return '';
        }

        return `${oldestDate} - ${newestDate}`;
    } catch (error) {
        console.error(`Failed to get date range for ${collection}`, error);
        return 'err';
    }
}