import Link from 'next/link';
import { BlogShell } from '../components/blog/BlogShell';
export default function NotFound() { return <BlogShell><article><h1>Page not found</h1><p>This address does not match an available TikSaveMP4 page.</p><p><Link href="/">Return to the TikTok downloader</Link></p></article></BlogShell>; }
