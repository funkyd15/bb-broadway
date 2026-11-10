import { extensions } from '@wix/astro/builders';
import config from './contact-details.config.ts';

export default extensions.dashboardModal({
  id: 'bdbe93a1-a19f-4c1b-9618-8598d73138d7',
  title: config.title,
  width: config.width,
  height: config.height,
  component: './extensions/dashboard/modals/contact-details/contact-details.tsx',
});
