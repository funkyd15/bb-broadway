import { items } from '@wix/data';

export async function bulkSaveSets(array: any[], collection: string) {
    let bulkSets = [];
    let makeSet = [];
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

export async function sumAmountReceived(collection: string, startDate: string, endDate: string) {

    let allItems = [];
    let results = await items.query(collection).ge('createdDate', startDate).le('createdDate', endDate)
        .limit(1000)
        .find();

    for (var i = 0; i < results.items.length; i++) {
        allItems.push(results.items[i]);

    }

    while (results.hasNext()) {
        results = await results.next();


        for (var j = 0; j < results.items.length; j++) {
            allItems.push(results.items[j]);

        }
    }

    const sumReceived = allItems.reduce(
        (accumulator, currentItem) => accumulator + currentItem.amountReceived,
        0,
    );

    // console.log({sumReceived});
    
    return sumReceived;

}