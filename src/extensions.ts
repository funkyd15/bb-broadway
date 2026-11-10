import { app } from '@wix/astro/builders';
import myPage from './extensions/dashboard/pages/bb-reporting/bb-reporting.extension.ts';

import contactsLabels from './extensions/dashboard/pages/contacts-labels/contacts-labels.extension.ts';

export default app()
  .use(myPage).use(contactsLabels);
