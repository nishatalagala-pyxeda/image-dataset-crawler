import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Dataset Observatory · Image dataset discovery',description:'Find and catalog image classification datasets across the web. Metadata only, with source evidence and downloadable records.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
