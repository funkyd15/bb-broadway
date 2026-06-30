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
    'expensesAnalytics',
];

export async function exportToCSV(startDate: Date, endDate: Date, statusState: Function) {
    const dataItems = await queryAnalyticsCollection(startDate, endDate, statusState);
    await uploadCSV(dataItems, `BB Broadway Reporting ${YYYYMMDD(startDate)}-${YYYYMMDD(endDate)}.csv`, "BB Reporting");
}

async function queryAnalyticsCollection(startDate: Date, endDate: Date, statusState: Function) {
    const startDt = YYYYMMDD(startDate);
    const endDt = YYYYMMDD(endDate);

    let allItems: any[] = [];

    function pushItems(array: any[], collection: string) {
  array.forEach(n => {
    n.collection = collection;

    for (const [key, value] of Object.entries(n)) {
      if (value !== null && typeof value === 'object') {
        n[key] = JSON.stringify(value);
      }
    }
  });

  allItems.push(...array);
}

    for (let i = 0; i < analyticsCollections.length; i++) {
        const collection = analyticsCollections[i];
        statusState(`${collection}...${allItems.length}`);
        let results = await wixData.query(collection).ge('createdDate', startDt).le('createdDate', endDt).descending('createdDate').limit(1000).find();
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
        jsonData.sort(function (a, b) {
            const sortKey = "createdDate";
            if (a[sortKey] < b[sortKey]) { return 1; }
            if (a[sortKey] > b[sortKey]) { return -1; }
            return 0;
        })

        // 1. Convert to CSV
        const keysToRemove = [
            "_owner",
            "_createdDate",
            "_updatedDate",
            "item",
            "order",
        ];

        const allKeys = [...new Set(jsonData.flatMap(Object.keys))]
            .filter(key => !keysToRemove.includes(key));

        const sortKeys = [
            "_id",
            "createdDate",
            "locked",
            "notes",
            "taxYear",
            "taxQuarter",
            "taxMonth",
            "collection",
            "amountReceived",
            "amountExpensed",
            "membershipBenefitValue",
            "paymentStatus",
            "selectedPaymentOption",
            "link",
            "paymentLink",
            "email",
            "title",
            "parseLocation",
            "teacher",
            "serviceTitle",
            "serviceType",
            "termYear",
            "term",
            "year",
            "eventTitle",
            "name",
            "orderNumber",
            "invoiceNumber",
            "amount",
            "discount",
            "couponCode",
            "couponCodes",
        ];


        allKeys.sort((a, b) => {
            const aIndex = sortKeys.indexOf(a);
            const bIndex = sortKeys.indexOf(b);

            // Both are sort keys
            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            }

            // Only a is a sort key
            if (aIndex !== -1) return -1;

            // Only b is a sort key
            if (bIndex !== -1) return 1;

            // Neither is in the custom order - sort alphabetically
            return a.localeCompare(b);
        });

        const csv = Papa.unparse({ fields: allKeys, data: jsonData });
        const csvWithBOM = "\uFEFF" + csv;
        const buffer = Buffer.from(csvWithBOM, "utf-8");

        // console.log(buffer);

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