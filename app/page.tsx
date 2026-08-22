import { redirect } from 'next/navigation';

export default function Home() {
  // Main Street, not the map: arriving among shopfronts with names over the
  // doors shows what is being sold. The map answers how much is left, which is
  // the second question, not the first.
  redirect('/street/main-street');
}
