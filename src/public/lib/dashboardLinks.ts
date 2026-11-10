import { dashboard } from "@wix/dashboard";

// Wix dashboard "Contacts List" page. A single contact is at <contacts page>/view/<contactId>.
export const CONTACTS_PAGE_ID = "bdd09dca-7cc9-4524-81d7-c9336071b33e";

// Our "Contact Details" dashboard modal (src/extensions/dashboard/modals/contact-details).
export const CONTACT_DETAILS_MODAL_ID = "bdbe93a1-a19f-4c1b-9618-8598d73138d7";

export interface ContactDetailsParams {
    contactId: string;
    labelNames: string[];
}

// Opens the contact's own Wix page in a new browser tab, so the current search is kept.
export async function openContactInWix(contactId: string) {
    const url = await dashboard.getPageUrl({ pageId: CONTACTS_PAGE_ID, relativeUrl: `/view/${contactId}` });
    window.open(url, "_blank", "noopener");
}

export function openContactDetails(params: ContactDetailsParams) {
    dashboard.openModal({ modalId: CONTACT_DETAILS_MODAL_ID, params: { ...params } });
}
