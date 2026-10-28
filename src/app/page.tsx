import { SaveFrameReference } from '../components/SaveFrameReference';
import { tiktokPageMarkup } from '../lib/tiktok-page';
import { pageMetadata } from '../lib/seo';
import seoPages from '../content/seo-pages.json';
export const generateMetadata = () => pageMetadata('/', seoPages['/'].title, seoPages['/'].description);
export default function HomePage() { return <SaveFrameReference markup={tiktokPageMarkup()} />; }
