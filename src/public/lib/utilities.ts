export const config = {
    includeOrder: false,
    includeItem: false,
};

export const wixAppIds = {
    "wixBookings": "13d21c63-b5ec-5912-8397-c3a5ddb27a97",
    "wixBlog": "14bcded7-0066-7c35-14d7-466cb3f09103",
    "wixCMS": "675bbcef-18d8-41f5-800e-131ec9e08762",
    "wixECommerce": "1380b703-ce81-ff05-f115-39571d94dfcd",
    "wixEvents": "140603ad-af8d-84a5-2c80-a0f60cb47351",
    "wixForms": "14ce1214-b278-a7e4-1373-00cebd1bef7c",
    "wixHotels": "135aad86-9125-6074-7346-29dc6a3c9bcf",
    "wixInbox": "141fbfae-511e-6817-c9f0-48993a7547d1",
    "wixInvoices": "13ee94c1-b635-8505-3391-97919052c16f",
    "wixMusic": "13bb5d67-1add-e770-a71f-001277e17c57",
    "wixOnlinePrograms": "2936472a-a1ed-4ae5-9f71-614313a9f4e7",
    "wixPayButton": "3575d251-42c3-4992-adff-170b2af90a2c",
    "wixPortfolio": "d90652a2-f5a1-4c7c-84c4-d4cdcc41f130",
    "wixPricingPlans": "1522827f-c56c-a5c9-2ac9-00f9e6ae12d3",
    "wixRestaurantsMenus": "b278a256-2757-4f19-9313-c05c783bec92",
    "wixRestaurantsOrdersNew": "9a5d83fd-8570-482e-81ab-cfa88942ee60",
    "wixRestaurantsOrdersOld": "13e8d036-5516-6104-b456-c8466db39542",
    "wixStores": "215238eb-22a5-4c36-9e7b-e7c08025e04e",
    "wixSubscriptions": "8725b255-2aa2-4a53-b76d-7d3c363aaeea",
    "wixTableReservations": "f9c07de2-5341-40c6-b096-8eb39de391fb",
    "wixVideo": "14409595-f076-4753-8303-9a86f9f71469"
}

export function YYYYMMDD(date: Date) {
    const formatted =
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')
        }-${String(date.getDate()).padStart(2, '0')
        }`;
    return formatted;
}

export enum TaxYearFormat {
    Year = "YEAR",
    Quarter = "QUARTER",
    Month = "MONTH",
}

export function getUKTaxYear(
    dateInput: string | Date,
    format: TaxYearFormat
): string {
    const date =
        typeof dateInput === "string"
            ? new Date(`${dateInput}T00:00:00`)
            : dateInput;

    const year = date.getFullYear();

    // 1 Apr - 31 Mar
    const taxYearStart =
        date >= new Date(year, 3, 1) // Apr = 3
            ? year
            : year - 1;

    const taxYearEnd = taxYearStart + 1;

    const taxYearLabel = `${taxYearStart}/${taxYearEnd}`;

    switch (format) {
        case TaxYearFormat.Year:
            return taxYearLabel;

        case TaxYearFormat.Quarter: {
            const quarter = getTaxQuarter(date, taxYearStart);
            return `${taxYearLabel} Q${quarter}`;
        }

        case TaxYearFormat.Month: {
            const calendarYear = date.getFullYear();
            const month = date.getMonth() + 1;
            const monthName = date.toLocaleString("en-GB", {
                month: "short",
            });

            return `${calendarYear}/${String(month).padStart(2, "0")} (${monthName} ${calendarYear})`;
        }

        default:
            throw new Error(`Unsupported format: ${format}`);
    }
}

function getTaxQuarter(date: Date, taxYearStart: number): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const q1Start = new Date(taxYearStart, 3, 1);
  const q2Start = new Date(taxYearStart, 6, 1);
  const q3Start = new Date(taxYearStart, 9, 1);
  const q4Start = new Date(taxYearStart + 1, 0, 1);

  if (d >= q4Start) return 4;
  if (d >= q3Start) return 3;
  if (d >= q2Start) return 2;
  return 1;
}

export function formatGBP(value: number) {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
    }).format(value);
}