import type { APIRoute } from "astro";
import { secrets } from "@wix/secrets";
import { getUKTaxYear, YYYYMMDD, TaxYearFormat ,config} from "../../public/lib/utilities";

export const GET: APIRoute = async ({ url }) => {

    const keySecret = await secrets.getSecretValue('transactionsAPIKey');
    const key = keySecret.value;

    const startDate: string | null = url.searchParams.get("startDate") || "";
    const endDate: string | null = url.searchParams.get("endDate") || "";
    const offset: string | null = url.searchParams.get("offset") || "0";

    let items: any = [];

    function stripTransactions(transactions: any[]) {
        let strippedItems: any[] = [];
        transactions.forEach(t => {
            const subscriptionId = t.order.description.wixAppOrderId;
            const createdDate = new Date(t.createdAt);
            const createdDateYYYYMMDD = createdDate.toISOString().split("T")[0];
            let amountReceived = t?.amount?.amount || 0;
            const paymentStatus = t?.status;

            if (paymentStatus === "PARTIAL_REFUND") {
                const refunds = t.refunds || [];
                const sumRefunds = refunds.reduce(
                    (accumulator, r:any) => accumulator + r.amount,
                    0,
                );
                amountReceived = amountReceived - sumRefunds;
            } else {
                if (paymentStatus !== "APPROVED") {
                    amountReceived = 0;
                }
            }


            strippedItems.push({
                _id: t?.transactionId,
                createdDate: createdDateYYYYMMDD,
                taxYear: getUKTaxYear(createdDate, TaxYearFormat.Year),
                taxQuarter: getUKTaxYear(createdDate, TaxYearFormat.Quarter),
                taxMonth: getUKTaxYear(createdDate, TaxYearFormat.Month),
                paymentStatus,
                appId: t?.appId,
                orderId: t?.order?.id,
                planName: t?.order?.description?.items?.[0]?.name,
                price: t?.order?.description?.items?.[0]?.price,
                discount: t?.order?.description?.additionalCharges?.discount,
                shipping: t?.order?.description?.additionalCharges?.shipping,
                tax: t?.order?.description?.additionalCharges?.tax,
                amountReceived: amountReceived,
                buyerContact: t?.order?.description?.wixAppBuyerId,
                subscriptionId,
                link: subscriptionId
                    ? `https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/subscriptions/${subscriptionId}`
                    : undefined,
                paymentLink: `https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/payments-dashboard/payment/${t?.transactionId}`,
                item: config.includeItem?t:undefined,
            });
        });


        return strippedItems || [];

    }

    try {
        const wixPricingPlanAppId = "1522827f-c56c-a5c9-2ac9-00f9e6ae12d3"
        const url = `https://www.wixapis.com/payments/v2/transactions?limit=1000&from=${startDate}&to=${endDate}&offset=${offset}&includeRefunds=true`;
        let httpResponseInstance = await fetch(
            url,
            {
                "method": "GET",
                headers: {
                    'Authorization': `${key}`,
                    'wix-site-id': `0210b701-c715-482e-bdcf-2e8185181308`,
                    'Content-Type': 'application/json',
                }
            });

        const results = await httpResponseInstance.json();

        items = results?.transactions.filter(i => i.appId === wixPricingPlanAppId) || [];

    } catch (error) {
        console.error(error);
    }


    return new Response(JSON.stringify(stripTransactions(items)), {
        headers: { "Content-Type": "application/json" },
    });
};