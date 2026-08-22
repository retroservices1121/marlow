import { redirect } from 'next/navigation';

export default function Home() {
  // The city is the front door: it is the one view that shows what is left.
  redirect('/city');
}
