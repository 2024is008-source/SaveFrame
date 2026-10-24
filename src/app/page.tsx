import { SaveFrameReference } from '../components/SaveFrameReference';
import { localizedHomepage } from '../i18n/homepage';
import { homepageMetadata } from '../i18n/server';

export const generateMetadata = () => homepageMetadata('en');

export default function HomePage() {
  return (
    <SaveFrameReference markup={localizedHomepage('en')} />
  );
}
