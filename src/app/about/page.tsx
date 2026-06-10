import { redirect } from 'next/navigation'

// «О нас» теперь живёт на корне сайта (/). Старый адрес /about — редиректим на главную.
export default function AboutRedirect() {
  redirect('/')
}
