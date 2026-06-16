import { files } from "@wix/media";
import axios, { all } from "axios";
import * as Papa from "papaparse";
import { items as wixData } from "@wix/data"
import { Buffer } from "buffer";
import { YYYYMMDD } from "./utilities";


const analyticsCollections = [
    'bookingsAnalytics',
    'eventsAnalytics',
    'storesAnalytics',
    'invoicesAnalytics',
    'pricingPlanAnalytics',
];

export async function exportToCSV(startDate: Date, endDate: Date, statusState: Function) {
    const dataItems = await queryAnalyticsCollection(startDate, endDate, statusState);
    await uploadCSV(dataItems, `BB Broadway Reporting ${YYYYMMDD(startDate)}-${YYYYMMDD(endDate)}.csv`, "BB Reporting");
}

async function queryAnalyticsCollection(startDate: Date, endDate: Date, statusState: Function) {
    const startDt = YYYYMMDD(startDate);
    const endDt = YYYYMMDD(endDate);

    let allItems:any[] = [];

    function pushItems(array: any[], collection: string) {
        array.forEach(n => {
            n.collection = collection;
        });
        allItems.push(...array);

    }

    for (let i = 0; i < analyticsCollections.length; i++) {
        const collection = analyticsCollections[i];
        statusState(`${collection}...${allItems.length}`);
        let results = await wixData.query(collection).ge('createdDate', startDt).le('createdDate', endDt).limit(1000).find();
        pushItems(results.items, collection);


        while (results.hasNext()) {
            statusState(`${collection}...${allItems.length}`);
            results = await results.next();
            pushItems(results.items, collection);
        }

    }


    return allItems;


}


async function uploadCSV(jsonData: any[], filename: string, filePath: string) {
    try {
        // 1. Convert to CSV
        const keysToRemove = [
            "_owner",
            "_createdDate",
            "_updatedDate",
            "item",
            "order",
        ];

        const allKeys = [...new Set(jsonData.flatMap(Object.keys))].filter(key => !keysToRemove.includes(key));
        const csv = Papa.unparse({ fields: allKeys, data: jsonData });
        const csvWithBOM = "\uFEFF" + csv;
        const buffer = Buffer.from(csvWithBOM, "utf-8");

        console.log(buffer);

        // 2. Generate upload URL
        const uploadUrlRes = await files.generateFileUploadUrl("text/csv", {
            fileName: filename,
            filePath
        });

        console.log(uploadUrlRes);


        const uploadUrl = uploadUrlRes.uploadUrl;

        // 3. Upload file
        const uploadResponse = await axios.put(uploadUrl, buffer, {
            headers: {
                "Content-Type": "text/csv"
            }
        });

        console.log(uploadResponse);


        const fileId =
            uploadResponse.data?.file?.id;

        if (!fileId) {
            throw new Error("Upload succeeded but fileId not returned");
        }

        // 4. Generate download URL
        const downloadRes = await files.generateFileDownloadUrl(fileId);

        console.log(downloadRes);

        const downloadUrl = downloadRes?.downloadUrls[0]?.url

        console.log(downloadUrl);

        window.open(downloadUrl, "_blank");

        return {
            uploadResponse,
            fileId,
            downloadUrl
        };

    } catch (error) {
        console.error("Error uploading CSV:", error);
        throw error;
    }
}