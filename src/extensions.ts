import { app } from '@wix/astro/builders';
import myPage from './extensions/dashboard/pages/bb-reporting/bb-reporting.extension.ts';

import contactsLabels from './extensions/dashboard/pages/contacts-labels/contacts-labels.extension.ts';

import contactDetails from './extensions/dashboard/modals/contact-details/contact-details.extension.ts';

export default app()
  .use(myPage).use(contactsLabels).use(contactDetails);
