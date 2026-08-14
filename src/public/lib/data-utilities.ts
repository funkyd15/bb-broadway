import { items, collections } from '@wix/data';
import { YYYYMMDD } from './utilities';
import { v4 as uuidv4 } from 'uuid';

export async function bulkLockOrUnlockAnalytics(collection: string, startDate: string, endDate: string, lock: Boolean, statusState: Function) {
    let count = 0;
    statusState(`${lock ? 'Locking' : 'Unlocking'}: ${collection} (${count})`);

    async function bulkLockOrUnlockItems(array: any[]) {
        array.forEach(arrayItem => {
            arrayItem.locked = lock;
        });
        // console.log("bulkLockOrUnlockItems",structuredClone(array));

        count += array.length;
        await bulkSaveSets(array, collection, statusState, { ignoreLocked: true });

    }

    let results = await items.query(collection).ge('createdDate', startDate).le('createdDate', endDate).limit(1000).find();
    await bulkLockOrUnlockItems(results.items);

    while (results.hasNext()) {
        results = await results.next();
        await bulkLockOrUnlockItems(results.items);
    }

}

export async function bulkRemoveAnalytics(collection: string, startDate: string, endDate: string, statusState: Function) {
    let allIds = [];
    statusState(`Removing: ${collection} (${allIds.length})`);

    async function bulkRemoveItems(removeItems: any[]) {
        if (removeItems.length > 0) {
            const ids = removeItems.map(i => i._id);
            allIds.push(...ids);
            await items.bulkRemove(collection, ids);
            statusState(`Removing: ${collection} (${allIds.length})`);
        }
    }

    let results = await items.query(collection).ge('createdDate', startDate).le('createdDate', endDate).ne('locked', true).limit(1000).find();
    await bulkRemoveItems(results.items);

    while (results.hasNext()) {
        results = await results.next();
        await bulkRemoveItems(results.items);
    }

}

export async function bulkSaveSets(array: any[], collection: string, statusState: Function, options?: any) {
    let bulkSets = [];
    let makeSet = [];
    array = await translateValues(array);

    if (array && array.length > 0) {
        array.forEach((item) => {
            (Object.keys(item) as Array<keyof typeof item>).forEach((key) => {
                const value = item[key];

                if (typeof value === "string") {
                    item[key] = value.trim() as typeof value;
                }
            });
        });
    }

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

        await bulkSaveItems(collection, bulkSets[i], options)
    }
}

const timer = (ms: number) => new Promise(res => setTimeout(res, ms));
async function bulkSaveItems(collection: string, array: any[], options?: any) {

    let saveItems: any[] = [];

    if (options?.ignoreLocked) {
        saveItems = array;
    } else {
        const ids = array.map(i => i._id);
        const results = await items.query(collection).hasSome('_id', ids).limit(1000).find();
        const existingItems = results.items;
        const lockedItems = existingItems.filter(i => i.locked); //Boolean
        const lockedIds = lockedItems.map(i => i._id);
        array.forEach(item => {
            if (!lockedIds.includes(item._id)) {
                saveItems.push(item);
            } else {
                let findLockedItem = lockedItems.find(i => i._id === item._id);
                if (findLockedItem) {
                    const allowableOverrideKeys = ['bookingStartDate'];
                    allowableOverrideKeys.forEach(overrideKey => {
                        findLockedItem[overrideKey] = item[overrideKey];
                    });
                    saveItems.push(findLockedItem);
                }
            }
        });
    }


    if (saveItems.length > 0) {
        try {
            await items.bulkSave(collection, saveItems);
        } catch (error) {
            console.log(error);
            await timer(300);
            try {
                await items.bulkSave(collection, saveItems);

            } catch (error) {
                console.log(error);

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
export async function sumAmountExpensed(collection: string, startDate: string, endDate: string) {

    const filter = items
        .filter()
        .ge('createdDate', startDate)
        .le('createdDate', endDate);

    const results = await items
        .aggregate(collection)
        .filter(filter)
        .sum('amountExpensed')
        .ascending('amountExpensedSum')
        .run();


    return results.items[0]?.amountExpensedSum || 0;

}

export async function aggregateCollectionWithMembershipValue(
    collection: string,
    startDate: string,
    endDate: string,
    group: string,
): Promise<any[]> {

    const [amountSumAggResults, membershipBenefitSumAggResults] = await Promise.all(
        [
            aggregateCollection(collection, startDate, endDate, group, 'amountReceived'),
            aggregateCollection(collection, startDate, endDate, group, 'membershipBenefitValue'),
        ]
    )


    amountSumAggResults.forEach(a => {
        const findMembership = membershipBenefitSumAggResults.find(i => i._id === a._id);
        const membershipBenefitValueSum = findMembership?.membershipBenefitValueSum || 0;
        a.membershipBenefitValueSum = membershipBenefitValueSum;
        a.amountAndMembershipValueSum = membershipBenefitValueSum + a.amountReceivedSum;

    });

    return amountSumAggResults;

}
export async function aggregateCollectionWithMembershipValueAndExpenses(
    collection: string,
    startDate: string,
    endDate: string,
    group: string,
): Promise<any[]> {

    const [amountSumAggResults, membershipBenefitSumAggResults, expensesSumAggResults] = await Promise.all(
        [
            aggregateCollection(collection, startDate, endDate, group, 'amountReceived'),
            aggregateCollection(collection, startDate, endDate, group, 'membershipBenefitValue'),
            aggregateCollection(`expensesAnalytics`, startDate, endDate, group, 'amountExpensed', true),
        ]
    )


    amountSumAggResults.forEach(a => {
        const findMembership = membershipBenefitSumAggResults.find(i => i._id === a._id);
        const membershipBenefitValueSum = findMembership?.membershipBenefitValueSum || 0;
        a.membershipBenefitValueSum = membershipBenefitValueSum;
        a.amountAndMembershipValueSum = membershipBenefitValueSum + a.amountReceivedSum;


        const findExpenses = expensesSumAggResults.find(i => i._id === a._id);
        const amountExpensedSum = findExpenses?.amountExpensedSum || 0;

        a.amountExpensedSum = amountExpensedSum;

        a.sum = a.amountReceivedSum + a.membershipBenefitValueSum + a.amountExpensedSum;
    });

    expensesSumAggResults.forEach(e => {

        const findAmount = amountSumAggResults.find(i => i._id === e._id);
        if (!findAmount) {
            amountSumAggResults.push(e)
        }

    });




    return amountSumAggResults;

}


export async function aggregateCollection(
    collection: string,
    startDate: string,
    endDate: string,
    group?: string,
    sum?: string,
    ignoreBlanks?: boolean,
): Promise<any[]> {
    if (!sum) { sum = 'amountReceived' };
    // console.log(sum);

    let allItems = [];
    let filter = items
        .filter()
        .ge('createdDate', startDate)
        .le('createdDate', endDate);

    if (ignoreBlanks && group) {
        filter = filter.ne(group, undefined).ne(group, "");
    }

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

    // if (ignoreBlanks && group) {

    // console.log("ignoreBlanks && group", ignoreBlanks, group, allItems);

    // }

    return allItems as any[];

}

export async function aggregateBookingsServiceTermYearLocation(
    startDate: string,
    endDate: string,
): Promise<any[]> {
    let allItems = [];
    const filter = items
        .filter()
        .ge('createdDate', startDate)
        .le('createdDate', endDate);


    function formAgg(collection: string) {
        return items
            .aggregate(collection)
            .filter(filter)
            .descending('amountReceivedSum')
            .group('serviceType', 'year', 'term', 'parseLocation')
            .limit(1000)
    }



    let resultsAmount = await formAgg('bookingsAnalytics').sum('amountReceived').run();

    allItems.push(...resultsAmount.items)

    // console.log(results);
    while (resultsAmount.hasNext()) {
        resultsAmount = await resultsAmount.next();
        allItems.push(...resultsAmount.items)
    }

    let resultsBenefit = await formAgg('bookingsAnalytics').sum('membershipBenefitValue').run();
    allItems.push(...resultsBenefit.items)

    // console.log("resultsBenefit", resultsBenefit);
    while (resultsBenefit.hasNext()) {
        resultsBenefit = await resultsBenefit.next();
        allItems.push(...resultsBenefit.items)
    }

    let resultsExpenses = await formAgg('expensesAnalytics').sum('amountExpensed').run();
    allItems.push(...resultsExpenses.items)

    while (resultsExpenses.hasNext()) {
        resultsExpenses = await resultsExpenses.next();
        allItems.push(...resultsExpenses.items)
    }


    allItems = combineArrayByKey(allItems, "_id");

    allItems = allItems.filter(i => i._id?.serviceType && i._id?.year && i._id?.term && i._id?.parseLocation);

    allItems.forEach(i => {
        i.sum = (i.amountReceivedSum || 0) + (i.membershipBenefitValueSum || 0) + (i.amountExpensedSum || 0);
    });

    // console.log("aggregateBookingsServiceLocation", allItems);

    return allItems as any[];
}
export async function aggregateEvents(
    startDate: string,
    endDate: string,
): Promise<any[]> {
    let allItems = [];
    const filter = items
        .filter()
        .ge('createdDate', startDate)
        .le('createdDate', endDate)
        .ne('eventTitle', undefined);


    function formAgg(collection: string) {
        return items
            .aggregate(collection)
            .filter(filter)
            .descending('amountReceivedSum')
            .group('eventTitle', 'serviceType', 'year', 'term', 'parseLocation', 'mainCategory')
            .limit(1000)
    }



    let resultsAmount = await formAgg('eventsAnalytics').sum('amountReceived').run();

    allItems.push(...resultsAmount.items)

    // console.log(results);
    while (resultsAmount.hasNext()) {
        resultsAmount = await resultsAmount.next();
        allItems.push(...resultsAmount.items)
    }


    let resultsExpenses = await formAgg('expensesAnalytics').sum('amountExpensed').run();
    allItems.push(...resultsExpenses.items)

    while (resultsExpenses.hasNext()) {
        resultsExpenses = await resultsExpenses.next();
        allItems.push(...resultsExpenses.items)
    }


    // allItems = combineArrayByKey(allItems, "_id");
    allItems = combineArrayByKey(allItems, "eventTitle");

    // allItems = allItems.filter(i => i._id?.serviceType && i._id?.year && i._id?.term && i._id?.parseLocation);

    allItems.forEach(i => {
        i.sum = (i.amountReceivedSum || 0) + (i.amountExpensedSum || 0);
    });

    console.log("aggregateEvents", allItems);

    return allItems as any[];
}


export async function aggregateExpenses(
    startDate: string,
    endDate: string,
    groups: string[],
): Promise<any[]> {
    let allItems = [];
    const filter = items
        .filter()
        .ge('createdDate', startDate)
        .le('createdDate', endDate);


    function formAgg(collection: string) {
        return items
            .aggregate(collection)
            .filter(filter)
            .ascending('amountExpensedSum')
            .group(...groups)
            .limit(1000)
    }

    let resultsAmount = await formAgg('expensesAnalytics').sum('amountExpensed').run();

    allItems.push(...resultsAmount.items)

    while (resultsAmount.hasNext()) {
        resultsAmount = await resultsAmount.next();
        allItems.push(...resultsAmount.items)
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

    function formAgg(collection: string) {
        return items
            .aggregate(collection)
            .filter(filter)
            .ascending('serviceType')
            .descending('amountReceivedSum')
            .group('serviceType', 'parseLocation')
            .limit(1000)
    }

    let resultsAmount = await formAgg('bookingsAnalytics').sum('amountReceived').run();

    allItems.push(...resultsAmount.items)

    while (resultsAmount.hasNext()) {
        resultsAmount = await resultsAmount.next();
        allItems.push(...resultsAmount.items)
    }

    let resultsBenefit = await formAgg('bookingsAnalytics').sum('membershipBenefitValue').run();
    allItems.push(...resultsBenefit.items)

    while (resultsBenefit.hasNext()) {
        resultsBenefit = await resultsBenefit.next();
        allItems.push(...resultsBenefit.items)
    }

    let resultsExpenses = await formAgg('expensesAnalytics').sum('amountExpensed').run();
    allItems.push(...resultsExpenses.items)

    while (resultsExpenses.hasNext()) {
        resultsExpenses = await resultsExpenses.next();
        allItems.push(...resultsExpenses.items)
    }

    allItems = combineArrayByKey(allItems, "_id");

    allItems = allItems.filter(i => i._id?.serviceType && i._id?.parseLocation);

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
    let promises = collections.map(i =>
        // aggregateCollection(i, startDate, endDate, group)
        aggregateCollectionWithMembershipValue(i, startDate, endDate, group)
    );
    promises.push(aggregateCollection(`expensesAnalytics`, startDate, endDate, group, 'amountExpensed', true));

    const results = await Promise.all(promises);

    // console.log("aggregateAnalyticsCollections", results);

    const combineResults = combineResultsByKey(
        results,
        group,
    );


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
    function isOutOfDate(compareDate: Date, allowableDays: number) {
        const compare = new Date(
            compareDate.getFullYear(),
            compareDate.getMonth(),
            compareDate.getDate()
        );

        const today = new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            new Date().getDate()
        );

        const difference = today.getTime() - compare.getTime();
        const millisecondsPerDay = 24 * 60 * 60 * 1000;

        return difference > allowableDays * millisecondsPerDay;
    }

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

        return `${oldestDate} - ${newestDate}${isOutOfDate(new Date(newestDate), 0) ? '⚠️' : ''}`;
    } catch (error) {
        console.error(`Failed to get date range for ${collection}`, error);
        return 'err';
    }
}

export async function getCollectionFields(dataCollectionId: string) {
    const result = await collections.getDataCollection(dataCollectionId);
    let fields = result.fields?.map(i => ({ label: i.displayName, value: i.key }));
    return fields.sort(function (a, b) {
        const sortKey = "label";
        if (a[sortKey] < b[sortKey]) { return -1; }
        if (a[sortKey] > b[sortKey]) { return 1; }
        return 0;
    })
}

export enum TimeUnit {
    DAYS = 'DAYS',
    MONTHS = 'MONTHS',
    YEARS = 'YEARS',
}

export function addToYYYYMMDD(
    dateString: string,
    amount: number,
    unit: TimeUnit = TimeUnit.DAYS
): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);

    if (!match) {
        throw new Error(`Invalid date: ${dateString}`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(Date.UTC(year, month - 1, day));

    // Validate the input date
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error(`Invalid date: ${dateString}`);
    }

    switch (unit) {
        case TimeUnit.DAYS:
            date.setUTCDate(date.getUTCDate() + amount);
            break;

        case TimeUnit.MONTHS: {
            const originalDay = date.getUTCDate();

            // Move to first day to avoid overflow
            date.setUTCDate(1);
            date.setUTCMonth(date.getUTCMonth() + amount);

            // Last day of target month
            const lastDay = new Date(
                Date.UTC(
                    date.getUTCFullYear(),
                    date.getUTCMonth() + 1,
                    0
                )
            ).getUTCDate();

            date.setUTCDate(Math.min(originalDay, lastDay));
            break;
        }

        case TimeUnit.YEARS: {
            const originalDay = date.getUTCDate();
            const originalMonth = date.getUTCMonth();

            date.setUTCDate(1);
            date.setUTCFullYear(date.getUTCFullYear() + amount);

            const lastDay = new Date(
                Date.UTC(
                    date.getUTCFullYear(),
                    originalMonth + 1,
                    0
                )
            ).getUTCDate();

            date.setUTCMonth(originalMonth);
            date.setUTCDate(Math.min(originalDay, lastDay));
            break;
        }
    }

    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

export async function duplicateCMSItems(collection: string, queryOptions: any[], modifyOptions: any[], options: { timeUnit: TimeUnit, itterations: number, value: number }) {
    const duplicateDateStamp = new Date();
    const duplicateProcessId = uuidv4();
    let query = items.query(collection);
    queryOptions.filter(i => i.value).forEach(option => {
        query = query.eq(option.key, option.value);
    });
    const results = await query.limit(1000).find();
    let dataItems = results.items;
    let duplicatedItems: any = [];

    if (dataItems.length > 0) {
        dataItems.forEach(i => {
            for (let itteration = 1; itteration <= options.itterations; itteration++) {
                let dupeItem = structuredClone(i);
                delete dupeItem._id;

                if (dupeItem.createdDate) {

                    dupeItem.createdDate = addToYYYYMMDD(dupeItem.createdDate, options.value * itteration, options.timeUnit);
                }
                modifyOptions.filter(i => i.value).forEach(option => {
                    dupeItem[option.key] = option.value
                });
                dupeItem.duplicateDateStamp = duplicateDateStamp;
                dupeItem.duplicateProcessId = duplicateProcessId;
                duplicatedItems.push(dupeItem);
            }

        });

        const bulkResults = await items.bulkInsert(collection, duplicatedItems);

        // console.log(dataItems);
        // console.log(bulkResults);
        return { duplicatedItems, bulkResults }
    }

    return { duplicatedItems }

}

export async function countCMSItemsToDuplicate(collection: string, queryOptions: any[]) {
    // console.log({collection,queryOptions});

    let query = items.query(collection);
    queryOptions.filter(i => i.value).forEach(option => {
        if (option.value) {
            query = query.eq(option.key, option.value);
        }
    });
    const results = await query.limit(1000).find({ returnTotalCount: true });

    // console.log(results);


    return results.totalCount;


}