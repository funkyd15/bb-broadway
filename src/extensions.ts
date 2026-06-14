import { app } from '@wix/astro/builders';
import myPage from './extensions/dashboard/pages/bb-reporting/bb-reporting.extension.ts';

export default app()
  .use(myPage)
