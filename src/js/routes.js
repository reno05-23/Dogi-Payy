import Home from '../pages/home.f7';
import Beranda from '../pages/beranda.f7';
import Tentang from '../pages/tentang.f7';
import Transfer from '../pages/transfer.f7';
import Qris from '../pages/qris.f7';
import Tabungan from '../pages/tabungan.f7';
import Profil from '../pages/profile.f7';
import History from '../pages/history.f7';
import Topup from '../pages/topup.f7';
import Notifikasi from '../pages/notifikasi.f7';
import Login from '../pages/login.f7';
import Register from '../pages/register.f7';
import Fingerprint from '../pages/fingerprint.f7';

var routes = [
  // Auth routes
  { path: '/login/', component: Login },
  { path: '/register/', component: Register },
  { path: '/fingerprint/', component: Fingerprint },

  // Main app (home + tabs)
  {
    path: '/',
    component: Home,
    tabs: [
      { path: '/', id: 'view-beranda', component: Beranda },
      { path: '/transfer/', id: 'view-transfer', component: Transfer },
      { path: '/qris/', id: 'view-qris', component: Qris },
      { path: '/tabungan/', id: 'view-tabungan', component: Tabungan },
      { path: '/profil/', id: 'view-profil', component: Profil }
    ]
  },
  { path: '/tentang/', component: Tentang },
  { path: '/notifikasi/', component: Notifikasi },
  { path: '/history/', popup: { component: History } },
  { path: '/topup/', popup: { component: Topup } }
];

export default routes;