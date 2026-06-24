import Beranda from '../pages/beranda.f7';
import Home from '../pages/home.f7';
import Tentang from '../pages/tentang.f7';

var routes = [
    {
        path: '/',
        component: Home,
        tabs: [
            {path: '/', id: 'view-beranda', component: Beranda},
            {path: '/tentang/', id: 'view-tentang', component: Tentang}
        ]
    },
];

export default routes;