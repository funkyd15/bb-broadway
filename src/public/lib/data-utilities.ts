import { items } from '@wix/data';

export async function bulkSaveSets(array: any[], collection: string,statusState:Function) {
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
        statusState(`Saving (${i+1}/${sets})`);
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

    console.log("sumAmountReceived", results);

    return results.items[0]?.amountReceivedSum || 0;

}



export async function aggregateCollection(
    collection: string,
    startDate: string,
    endDate: string,
    group?: string,
): Promise<any[]> {
    let allItems = [];
    const filter = items
        .filter()
        .ge('createdDate', startDate)
        .le('createdDate', endDate);

    let agg = items
        .aggregate(collection)
        .filter(filter)
        .sum('amountReceived')
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


export async function aggregateAnalyticsCollections(
    collections: string[],
    startDate: string,
    endDate: string,
    group: string,
) {
    const promises = collections.map(i =>
        aggregateCollection(i, startDate, endDate, group)
    );

    const results = await Promise.all(promises);

    const combineResults = combineByKey(
        results,
        group,
        "amountReceivedSum"
    );
    console.log("aggregateAnalyticsCollections", combineResults);

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

function combineByKey<T extends AnyRecord>(
    data: T[][],
    groupKey: keyof T,
    valueKey: keyof T
) {
    const map = new Map<string, number>();

    for (const collection of data) {
        for (const item of collection) {
            const key = String(item[groupKey]);
            const value = Number(item[valueKey]) || 0;

            map.set(key, (map.get(key) ?? 0) + value);
        }
    }

    return Array.from(map.entries()).map(([key, sum]) => ({
        [groupKey]: key,
        [valueKey]: sum,
    })) as T[];
}