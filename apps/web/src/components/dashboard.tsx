'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ModuleWorkspace from './module-workspace';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Boxes, CalendarDays, ChevronDown,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, CreditCard, Download, FileBarChart2,
  LayoutDashboard, LogOut, Menu, MoreHorizontal, Package, Plus, Printer, Search, Settings,
  ShieldCheck, ShoppingBag, ShoppingCart, Stethoscope, Truck, Users, Wallet, X,
} from 'lucide-react';

type Medicine = { id: string; name: string; genericName: string; sku: string; barcode?: string | null; category: string; dosageForm: string; strength: string; manufacturer: string; prescriptionRequired: boolean; sellingPrice: string | number; reorderLevel: number; stock?: number };
type Sale = { id: string; receiptNumber: string; total: string | number; subtotal?: string | number; discount?: string | number; tax?: string | number; createdAt: string; user?: { name: string }; items?: { id?: string; medicine: { name: string }; quantity: number; unitPrice?: number | string }[] };
type DashboardMetrics = { salesCount: number; revenue: number; lowStock: number; expiring: number; inventoryValue: number; units: number };
type TopProduct = { name: string; category: string; units: number };
type Module = 'Overview' | 'Point of Sale' | 'Medicines' | 'Inventory' | 'Purchases' | 'Suppliers' | 'Sales' | 'Returns' | 'Expenses' | 'Reports' | 'Users & roles' | 'Settings' | 'Audit log';
type DashboardAccess = {
  overview: boolean; pointOfSale: boolean; medicines: boolean; addMedicine: boolean; editMedicine: boolean;
  inventory: boolean; purchases: boolean; suppliers: boolean; sales: boolean; returns: boolean;
  expenses: boolean; reports: boolean; users: boolean; addUsers: boolean; updateUsers: boolean;
  settings: boolean; audit: boolean;
};
const nav: { title: string; items: { name: Module; icon: typeof LayoutDashboard; permission: keyof DashboardAccess }[] }[] = [
  { title: 'WORKSPACE', items: [{ name: 'Overview', icon: LayoutDashboard, permission: 'overview' }, { name: 'Point of Sale', icon: ShoppingCart, permission: 'pointOfSale' }, { name: 'Medicines', icon: Package, permission: 'medicines' }, { name: 'Inventory', icon: Boxes, permission: 'inventory' }] },
  { title: 'OPERATIONS', items: [{ name: 'Purchases', icon: ShoppingBag, permission: 'purchases' }, { name: 'Suppliers', icon: Truck, permission: 'suppliers' }, { name: 'Sales', icon: CreditCard, permission: 'sales' }, { name: 'Returns', icon: ArrowDownRight, permission: 'returns' }, { name: 'Expenses', icon: Wallet, permission: 'expenses' }] },
  { title: 'MANAGEMENT', items: [{ name: 'Reports', icon: FileBarChart2, permission: 'reports' }, { name: 'Users & roles', icon: Users, permission: 'users' }, { name: 'Audit log', icon: Activity, permission: 'audit' }, { name: 'Settings', icon: Settings, permission: 'settings' }] },
];

const formatMoney = (n: number | string, currency = 'GHS') => new Intl.NumberFormat('en-GH', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(n || 0));

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal-card"><div className="modal-head"><div><span className="eyebrow">PHARMACARE</span><h2>{title}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={19}/></button></div>{children}</section></div>;
}

export default function Home({ user, access }: { user: { name: string; role: string }; access: DashboardAccess }) {
  const router = useRouter();
  const [active, setActive] = useState<Module>('Overview');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [stockFilter, setStockFilter] = useState('All status');
  const [modal, setModal] = useState<'medicine' | 'editMedicine' | 'sale' | null>(null);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [receiptPrinting, setReceiptPrinting] = useState(false);
  const [salePending, setSalePending] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [splitPayment, setSplitPayment] = useState(false);
  const [cartItems, setCartItems] = useState<{ medicineId: string; quantity: number }[]>([{ medicineId: '', quantity: 1 }]);
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics>({ salesCount: 0, revenue: 0, lowStock: 0, expiring: 0, inventoryValue: 0, units: 0 });
  const [currency, setCurrency] = useState('GHS');
  const [timezone, setTimezone] = useState('Africa/Accra');
  const [logoUrl, setLogoUrl] = useState('');
  const [pharmacy, setPharmacy] = useState({ name: 'PharmaCare Osu', address: 'Oxford Street, Osu · Accra, Ghana', phone: '+233 30 290 1122', receiptFooter: 'Thank you for choosing us.' });
  const [trend, setTrend] = useState<number[]>(Array(7).fill(0));
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  useEffect(() => {
    Promise.all([fetch('/api/medicines').then(r => r.ok ? r.json() : null).catch(() => null), fetch('/api/sales').then(r => r.ok ? r.json() : null).catch(() => null), fetch('/api/dashboard').then(r => r.ok ? r.json() : null).catch(() => null), fetch('/api/settings').then(r => r.ok ? r.json() : null).catch(() => null)])
      .then(([m, s, d, st]) => { if (Array.isArray(m?.medicines)) setMedicines(m.medicines); if (Array.isArray(s?.sales)) setSales(s.sales); if (d?.metrics) setMetrics(d.metrics); if (Array.isArray(d?.trend)) setTrend(d.trend); if (Array.isArray(d?.topProducts)) setTopProducts(d.topProducts); if (st?.settings?.currency) setCurrency(st.settings.currency); if (st?.settings?.timezone) setTimezone(st.settings.timezone); if (st?.settings?.logoUrl) setLogoUrl(st.settings.logoUrl); if (st?.settings) setPharmacy({ name: st.settings.name, address: st.settings.address, phone: st.settings.phone, receiptFooter: st.settings.receiptFooter }); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(t); }, [notice]);
  useEffect(() => {
    const updateHeader = () => document.querySelector('.topbar')?.classList.toggle('topbar-scrolled', window.scrollY > 12);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const elements = document.querySelectorAll<HTMLElement>('.page-content .metric-card, .page-content .panel, .page-content .module-placeholder, .page-content .page-footer');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -28px 0px' });
    elements.forEach((element, index) => {
      element.classList.add('scroll-reveal');
      element.style.setProperty('--reveal-order', String(index % 6));
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, [active]);

  const filteredMedicines = useMemo(() => medicines.filter(m => `${m.name} ${m.genericName} ${m.sku} ${m.category}`.toLowerCase().includes(search.toLowerCase()) && (categoryFilter === 'All categories' || m.category === categoryFilter) && (stockFilter === 'All status' || (stockFilter === 'Out of stock' ? Number(m.stock ?? 0) === 0 : stockFilter === 'Low stock' ? Number(m.stock ?? 0) > 0 && Number(m.stock ?? 0) <= m.reorderLevel : Number(m.stock ?? 0) > m.reorderLevel))), [medicines, search, categoryFilter, stockFilter]);
  const filteredSales = useMemo(() => sales.filter(s => `${s.receiptNumber} ${s.user?.name ?? ''}`.toLowerCase().includes(search.toLowerCase())), [sales, search]);
  const lowStock = metrics.lowStock;
  const firstName = user.name.split(' ')[0] || user.name;
  const initials = user.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  const visibleNav = nav.map(group => ({ ...group, items: group.items.filter(item => access[item.permission]) })).filter(group => group.items.length > 0);
  const money = (n: number | string) => formatMoney(n, currency);
  const todayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone }).format(new Date());
  const chartGeometry = useMemo(() => {
    const maxValue = Math.max(500, ...trend); const max = Math.ceil(maxValue / 500) * 500;
    const points = trend.map((value, i) => ({ x: i * (700 / Math.max(1, trend.length - 1)), y: 170 - (value / max) * 145 }));
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
    return { max, line, area: `${line} L700,190 L0,190 Z`, last: points[points.length - 1] ?? { x: 0, y: 170 } };
  }, [trend]);
  const title = active === 'Overview' ? `Good morning, ${firstName}` : active;
  const subtitle = active === 'Overview'
    ? user.role === 'INVENTORY_MANAGER'
      ? 'Stock levels, upcoming expiries and purchasing at a glance.'
      : user.role === 'CASHIER'
        ? 'Your sales desk, recent transactions and stock availability.'
        : user.role === 'PHARMACIST'
          ? 'Dispensing activity, prescription checks and medicines on hand.'
          : 'A clear view of your pharmacy operations for today.'
    : `Manage your pharmacy ${active.toLowerCase()} in one place.`;

  async function createMedicine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget));
    const edit = modal === 'editMedicine'; const response = await fetch(edit ? `/api/medicines/${selectedMedicine?.id}` : '/api/medicines', { method: edit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, prescriptionRequired: data.prescriptionRequired === 'on', sellingPrice: Number(data.sellingPrice), reorderLevel: Number(data.reorderLevel) }) });
    if (response.ok) { const result = await response.json(); setMedicines(prev => edit ? prev.map(m => m.id === result.medicine.id ? { ...result.medicine, stock: m.stock } : m) : [result.medicine, ...prev]); setNotice(edit ? 'Medicine details updated' : 'Medicine added to your catalogue'); setModal(null); setSelectedMedicine(null); }
    else setNotice(response.status === 401 ? 'Sign in to save medicines' : (await response.json().catch(() => null))?.error ?? 'Could not save medicine');
  }

  async function createSale(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (salePending) return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const items = cartItems.filter(item => item.medicineId && Number.isInteger(item.quantity) && item.quantity > 0);
    if (!items.length) return setNotice('Add a medicine before starting a sale');
    const payload = { items, paymentMethod: data.paymentMethod, paymentReference: data.paymentReference, prescriptionReference: data.prescriptionReference || undefined, discount: Number(data.discount ?? 0), ...(data.paymentMethod === 'SPLIT' ? { payments: [{ method: data.splitMethod1, amount: Number(data.splitAmount1), reference: data.splitReference1 || '' }, { method: data.splitMethod2, amount: Number(data.splitAmount2), reference: data.splitReference2 || '' }] } : {}) };
    setSalePending(true);
    try {
      const response = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(response.status === 401 ? 'Sign in to complete a sale' : result?.error ?? 'Could not complete sale');
        return;
      }
      if (!result?.sale?.id || !result.sale.receiptNumber) {
        setNotice('The sale was saved, but its receipt details could not be loaded. Open it from Sales to view the receipt.');
        return;
      }
      setSales(prev => [result.sale, ...prev.filter(sale => sale.id !== result.sale.id)]);
      setReceiptPrinting(true);
      setReceipt(result.sale);
      setModal(null);
      setNotice(`Sale completed · ${result.sale.receiptNumber}`);
    } catch (error) {
      console.error('Sale checkout request failed:', error);
      setNotice('Could not reach the sales service. Check your connection and try again.');
    } finally {
      setSalePending(false);
    }
  }

  async function archiveMedicine(medicine: Medicine) {
    if (!window.confirm(`Archive ${medicine.name}? Existing sales and stock records will be retained.`)) return;
    const response = await fetch(`/api/medicines/${medicine.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }) });
    const result = await response.json();
    if (!response.ok) return setNotice(result.error ?? 'Could not archive medicine');
    setMedicines(prev => prev.filter(item => item.id !== medicine.id)); setNotice('Medicine archived');
  }

  function scanBarcode(value: string) {
    setBarcodeSearch(value);
    const match = medicines.find(m => m.barcode === value.trim());
    if (match) setCartItems(items => items.map((item, index) => index === 0 ? { ...item, medicineId: match.id } : item));
  }
  function openSale() { setCartItems([{ medicineId: medicines[0]?.id ?? '', quantity: 1 }]); setBarcodeSearch(''); setSplitPayment(false); setModal('sale'); }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#overview" onClick={() => setActive('Overview')}><span className="brand-mark" style={logoUrl ? { backgroundImage: `url("${logoUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>{!logoUrl && <Plus size={22}/>}</span><span><b>pharma<span>care</span></b><small>PHARMACY MANAGEMENT</small></span></a>
      <div className="branch-select"><span className="branch-avatar">P</span><span><b>{pharmacy.name}</b><small>Accra, Ghana</small></span><ChevronDown size={16}/></div>
      <nav className="side-nav">{visibleNav.map(group => <div className="nav-group" key={group.title}><div className="nav-label">{group.title}</div>{group.items.map(item => <button key={item.name} className={`nav-item ${active === item.name ? 'selected' : ''}`} onClick={() => { setActive(item.name); setSearch(''); setMobileNav(false); }}><item.icon size={18} strokeWidth={1.8}/><span>{item.name}</span>{item.name === 'Inventory' && lowStock > 0 && <i className="nav-count">{lowStock}</i>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={19}/></div><b>Need a hand?</b><p>Our support team is here for you.</p><button onClick={() => setNotice('Support: support@pharmacare.example')}>Visit help center <ArrowUpRight size={14}/></button></div><button className="profile-row" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); router.refresh(); }}><span className="profile-pic">{initials}</span><span><b>{user.name}</b><small>{user.role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}</small></span><LogOut size={17}/></button></div>
    </aside>
    {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14}/><b>{active}</b></div></div><div className="topbar-actions"><label className="global-search"><Search size={17}/><input aria-label="Search medicines or receipts" placeholder="Search medicines, receipts..." value={search} onChange={e => setSearch(e.target.value)}/></label><button className="icon-button notification-button" aria-label="Notifications" onClick={async () => { const response = await fetch('/api/notifications'); const result = await response.json(); setNotice(response.ok ? (result.notifications.length ? result.notifications.length + ' alerts need your attention' : 'You are all caught up') : result.error ?? 'Could not load notifications'); }}><Bell size={19}/><i/></button><span className="top-divider"/><button className="profile-mini" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); router.refresh(); }}><span className="profile-pic">{initials}</span><ChevronDown size={15}/></button></div></header>
      <div className="page-content"><div className="page-heading"><div><div className="date-line"><CalendarDays size={14}/> {todayLabel}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="heading-actions">{active === 'Overview' && <>{access.reports && <Link className="button button-secondary" href="/api/reports?format=csv" prefetch={false} download><Download size={16}/> Export report</Link>}{access.pointOfSale && <button className="button button-primary" onClick={openSale}><Plus size={17}/> New sale</button>}</>}{active === 'Medicines' && access.addMedicine && <button className="button button-primary" onClick={() => setModal('medicine')}><Plus size={17}/> Add medicine</button>}{active === 'Point of Sale' && access.pointOfSale && <button className="button button-primary" onClick={openSale}><Plus size={17}/> Start a sale</button>}</div></div>
        {active === 'Overview' ? <>
          <div className={`metric-grid ${access.sales && access.inventory ? '' : 'metric-grid-focused'}`}>
            {access.sales && <><Metric icon={<CreditCard size={19}/>} label="Today's sales" value={`${metrics.salesCount}`} delta="Today" note="completed transactions" positive/><Metric icon={<Wallet size={19}/>} label="Revenue today" value={money(metrics.revenue)} delta="Today" note="before expenses" positive/></>}
            {access.inventory && <><Metric icon={<Boxes size={19}/>} label="Low stock items" value={`${metrics.lowStock}`} delta={`${metrics.lowStock} items`} note="need attention" alert/><Metric icon={<Clock3 size={19}/>} label="Expiring soon" value={`${metrics.expiring}`} delta="Expiry threshold" note="batches to review"/><Metric icon={<Package size={19}/>} label="Inventory value" value={money(metrics.inventoryValue)} delta={`${metrics.units.toLocaleString()} units`} note="at purchase cost"/></>}
          </div>
          <div className="dashboard-grid">
            {access.sales && <section className="panel sales-chart-panel"><div className="panel-head"><div><h2>Sales overview</h2><p>Track your pharmacy performance over time</p></div><span className="select-small chart-period">Today</span></div><div className="chart-key"><span><i className="key-dot teal-dot"/>Revenue</span><span><i className="key-dot pale-dot"/>Transactions</span><b>{money(metrics.revenue)} <small><ArrowUpRight size={13}/> Today</small></b></div><div className="chart-wrap"><div className="chart-y">{[chartGeometry.max, chartGeometry.max * 2 / 3, chartGeometry.max / 3, 0].map((value, index) => <span key={index}>{money(Math.round(value))}</span>)}</div><svg className="chart" viewBox="0 0 700 190" preserveAspectRatio="none" role="img" aria-label="Sales revenue by two-hour period today"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--teal)" stopOpacity=".2"/><stop offset="100%" stopColor="var(--teal)" stopOpacity="0"/></linearGradient></defs><path d={chartGeometry.area} fill="url(#area)"/><path d={chartGeometry.line} fill="none" stroke="var(--teal)" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/><circle cx={chartGeometry.last.x} cy={chartGeometry.last.y} r="5" fill="#fff" stroke="var(--teal)" strokeWidth="3"/></svg><div className="chart-x"><span>8 AM</span><span>10 AM</span><span>12 PM</span><span>2 PM</span><span>4 PM</span><span>6 PM</span><span>8 PM</span></div></div></section>}
            {access.reports && <TopProducts products={topProducts} onViewReport={() => setActive('Reports')} />}
            {access.sales && <section className="panel recent-panel"><div className="panel-head"><div><h2>Recent sales</h2><p>Your latest transactions</p></div><button className="text-link" onClick={() => setActive('Sales')}>View all sales <ArrowUpRight size={14}/></button></div>{sales.length > 0 ? <div className="table-scroll"><table><thead><tr><th>RECEIPT</th><th>CASHIER</th><th>ITEMS</th><th>AMOUNT</th><th>TIME</th><th>STATUS</th></tr></thead><tbody>{sales.slice(0,4).map(sale => <tr key={sale.id}><td><b className="receipt-id">{sale.receiptNumber}</b></td><td><span className="cashier-cell"><i>{sale.user?.name?.split(' ').map(x => x[0]).join('') ?? '—'}</i>{sale.user?.name ?? '—'}</span></td><td>{sale.items?.length ?? 0} items</td><td><b>{money(sale.total)}</b></td><td>{new Date(sale.createdAt).toLocaleTimeString('en-GH',{hour:'2-digit',minute:'2-digit'})}</td><td><span className="status-pill status-complete">Completed</span></td></tr>)}</tbody></table></div> : <div className="empty-state">No sales recorded today.</div>}<button className="mobile-view-all" onClick={() => setActive('Sales')}>View all sales <ArrowUpRight size={14}/></button></section>}
            {access.inventory && <section className="panel alerts-panel"><div className="panel-head"><div><h2>Stock at a glance</h2><p>Inventory items to review</p></div><span className="alert-number">{metrics.lowStock + metrics.expiring}</span></div><div className="alert-row"><span className="alert-symbol amber"><Package size={17}/></span><span><b>Low stock</b><small>Products at or below reorder level</small></span><span className="alert-tag">{metrics.lowStock}</span></div><div className="alert-row"><span className="alert-symbol rose"><Clock3 size={17}/></span><span><b>Expiring soon</b><small>Batches within the alert window</small></span><span className="alert-tag">{metrics.expiring}</span></div><button className="text-link" onClick={() => setActive('Inventory')}>Review inventory <ArrowUpRight size={14}/></button></section>}
          </div>
        </> : active === 'Medicines' ? <section className="panel module-panel"><div className="module-toolbar"><div className="toolbar-search"><Search size={16}/><input placeholder="Search medicines, SKU or category" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="toolbar-filters"><select className="select-small" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option>All categories</option>{Array.from(new Set(medicines.map(m => m.category))).sort().map(category => <option key={category}>{category}</option>)}</select><select className="select-small" value={stockFilter} onChange={e => setStockFilter(e.target.value)}><option>All status</option><option>Low stock</option><option>Out of stock</option><option>In stock</option></select><Link className="button button-secondary" href="/api/medicines?format=csv" prefetch={false} download><Download size={15}/> Export</Link></div></div><div className="table-scroll"><table><thead><tr><th>MEDICINE</th><th>SKU</th><th>CATEGORY</th><th>STOCK</th><th>SELLING PRICE</th><th>STATUS</th><th/></tr></thead><tbody>{filteredMedicines.map(m => <tr key={m.id}><td><span className="medicine-cell"><i className="med-circle"><Stethoscope size={15}/></i><span><b>{m.name}</b><small>{m.genericName} · {m.strength}</small></span></span></td><td>{m.sku}</td><td>{m.category}</td><td><b>{m.stock ?? '—'}</b> <small>units</small></td><td><b>{money(m.sellingPrice)}</b></td><td><span className={`status-pill ${(m.stock ?? 999) <= m.reorderLevel ? 'status-low' : 'status-complete'}`}>{(m.stock ?? 999) <= m.reorderLevel ? 'Low stock' : 'In stock'}</span></td><td>{access.editMedicine && <div className="row-actions"><button className="button button-secondary table-action" onClick={() => { setSelectedMedicine(m); setModal('editMedicine'); }}>Edit</button><button className="button button-secondary table-action" onClick={() => archiveMedicine(m)}>Archive</button></div>}</td></tr>)}</tbody></table>{filteredMedicines.length === 0 && <div className="empty-state"><Package size={28}/><b>No medicines found</b><span>Try another search or add a medicine.</span></div>}</div><div className="table-footer"><span>Showing <b>{filteredMedicines.length}</b> medicines</span><div><button className="icon-button" aria-label="Previous page"><ChevronLeft size={17}/></button><span className="page-number">1</span><button className="icon-button" aria-label="Next page"><ChevronRight size={17}/></button></div></div></section> : active === 'Sales' ? <section className="panel module-panel"><div className="module-toolbar"><div className="toolbar-search"><Search size={16}/><input placeholder="Search receipt or cashier" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="toolbar-filters">{access.pointOfSale && <button className="button button-primary" onClick={openSale}><Plus size={16}/> New sale</button>}</div></div><div className="table-scroll"><table><thead><tr><th>RECEIPT</th><th>CASHIER</th><th>ITEMS</th><th>TOTAL</th><th>DATE & TIME</th><th>STATUS</th></tr></thead><tbody>{filteredSales.map(s => <tr key={s.id}><td><button className="receipt-link" onClick={() => { setReceiptPrinting(false); setReceipt(s); }}>{s.receiptNumber}</button></td><td>{s.user?.name ?? '—'}</td><td>{s.items?.length ?? 0} items</td><td><b>{money(s.total)}</b></td><td>{new Date(s.createdAt).toLocaleString('en-GH')}</td><td><span className="status-pill status-complete">Completed</span></td></tr>)}</tbody></table></div></section> : active === 'Point of Sale' ? <section className="module-placeholder"><div className="placeholder-icon"><Activity size={26}/></div><span className="eyebrow">POINT OF SALE</span><h2>Ready when you are</h2><p>Find a medicine and complete a sale with FEFO batch allocation.</p><div className="placeholder-actions"><button className="button button-primary" onClick={openSale}><Plus size={16}/> Start a sale</button><button className="button button-secondary" onClick={() => setActive('Sales')}>View sales history</button></div></section> : <ModuleWorkspace active={active} medicines={medicines} onNotice={setNotice} canEditPermissions={user.role === 'SUPER_ADMIN'} canCreateUsers={access.addUsers} canUpdateUsers={access.updateUsers} currency={currency}/>}
        <footer className="page-footer"><span>© {new Date().getFullYear()} PharmaCare · Built for better health</span><span><span className="online-dot"/> All systems operational <span className="footer-divider">·</span> {currency} · {timezone}</span></footer>
      </div></main>
      {(modal === 'medicine' || modal === 'editMedicine') && <Modal title={modal === 'medicine' ? 'Add a medicine' : 'Edit medicine'} close={() => { setModal(null); setSelectedMedicine(null); }}><form className="form-grid" onSubmit={createMedicine}><label className="field full-field">Medicine name<input name="name" required defaultValue={selectedMedicine?.name} placeholder="e.g. Paracetamol 500mg Tablets"/></label><label className="field">Generic name<input name="genericName" defaultValue={selectedMedicine?.genericName} placeholder="e.g. Paracetamol"/></label><label className="field">SKU<input name="sku" required defaultValue={selectedMedicine?.sku} placeholder="e.g. PCM-500-TAB"/></label><label className="field">Category<input name="category" required defaultValue={selectedMedicine?.category} placeholder="e.g. Pain relief"/></label><label className="field">Dosage form<input name="dosageForm" required defaultValue={selectedMedicine?.dosageForm} placeholder="e.g. Tablet"/></label><label className="field">Strength<input name="strength" required defaultValue={selectedMedicine?.strength} placeholder="e.g. 500mg"/></label><label className="field">Manufacturer<input name="manufacturer" defaultValue={selectedMedicine?.manufacturer} placeholder="Manufacturer"/></label><label className="field">Selling price (GHS)<input name="sellingPrice" type="number" min="0" step="0.01" required defaultValue={selectedMedicine?.sellingPrice} placeholder="0.00"/></label><label className="field">Reorder level<input name="reorderLevel" type="number" min="0" defaultValue={selectedMedicine?.reorderLevel ?? 10} required/></label><label className="field full-field check-field"><input name="prescriptionRequired" type="checkbox" defaultChecked={selectedMedicine?.prescriptionRequired}/> Prescription required</label><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => { setModal(null); setSelectedMedicine(null); }}>Cancel</button><button className="button button-primary"><Plus size={16}/> Save medicine</button></div></form></Modal>}
      {modal === 'sale' && <Modal title="Complete a sale" close={() => { setModal(null); setSplitPayment(false); }}><form className="form-grid" onSubmit={createSale}><label className="field full-field">Scan barcode or search medicine<input name="barcodeSearch" value={barcodeSearch} onChange={e => scanBarcode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="Scan a barcode or type a product barcode"/></label><div className="full-field cart-lines">{cartItems.map((item, index) => <div className="cart-line" key={index}><label className="field">Medicine<select name="medicineId" required value={item.medicineId || medicines[0]?.id || ''} onChange={e => setCartItems(lines => lines.map((line, i) => i === index ? { ...line, medicineId: e.target.value } : line))}>{medicines.map(m => <option key={m.id} value={m.id}>{m.name} · {m.sku} · {money(m.sellingPrice)}</option>)}</select></label><label className="field">Quantity<input name="quantity" type="number" min="1" value={item.quantity} onChange={e => setCartItems(lines => lines.map((line, i) => i === index ? { ...line, quantity: Number(e.target.value) } : line))} required/></label>{cartItems.length > 1 && <button type="button" className="button button-secondary cart-remove" onClick={() => setCartItems(lines => lines.filter((_, i) => i !== index))}>Remove</button>}</div>)}</div><button type="button" className="button button-secondary full-field cart-add" onClick={() => setCartItems(lines => [...lines, { medicineId: medicines[0]?.id ?? '', quantity: 1 }])}><Plus size={14}/> Add another medicine</button><label className="field">Quantity<input name="quantity" type="number" min="1" defaultValue="1" required/></label><label className="field">Payment method<select name="paymentMethod" onChange={e => setSplitPayment(e.target.value === 'SPLIT')}><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile Money</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="SPLIT">Split payment</option></select></label>{splitPayment ? <><label className="field">First payment method<select name="splitMethod1"><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile Money</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option></select></label><label className="field">First amount (GHS)<input name="splitAmount1" type="number" min="0.01" step="0.01" required/></label><label className="field">First reference<input name="splitReference1" placeholder="Optional reference"/></label><label className="field">Second payment method<select name="splitMethod2"><option value="MOBILE_MONEY">Mobile Money</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option></select></label><label className="field">Second amount (GHS)<input name="splitAmount2" type="number" min="0.01" step="0.01" required/></label><label className="field">Second reference<input name="splitReference2" placeholder="Optional reference"/></label><div className="sale-note full-field">Split payment amounts must add up to the sale total. References are recorded as entered; external payments are not verified here.</div></> : <label className="field full-field">Payment reference<input name="paymentReference" placeholder="Optional · transaction reference"/></label>}{['SUPER_ADMIN','PHARMACY_MANAGER'].includes(user.role) && <label className="field full-field">Authorized discount (GHS)<input name="discount" type="number" min="0" step="0.01" defaultValue="0"/></label>}<label className="field full-field">Prescription reference<input name="prescriptionReference" placeholder="Required for prescription medicines"/></label><div className="sale-note full-field"><ShieldCheck size={16}/> Stock is allocated by earliest expiry. Expired batches cannot be sold.</div><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => { setModal(null); setSplitPayment(false); }}>Cancel</button><button className="button button-primary"><CreditCard size={16}/> Complete sale</button></div></form></Modal>}
      {receipt && <Modal title={`Receipt · ${receipt.receiptNumber}`} close={() => { setReceipt(null); setReceiptPrinting(false); }}><div className={`receipt-printer-scene ${receiptPrinting ? 'is-printing' : ''}`} aria-live="polite"><div className="receipt-printer"><div className="printer-display"><span className="printer-ready">Receipt ready</span><span className="printer-progress">Printing...</span></div><div className="printer-slot"/><div className="printer-base"><Printer size={16}/><span>PHARMACARE RECEIPT PRINTER</span></div></div></div><div className={`receipt-paper ${receiptPrinting ? 'receipt-paper-printing' : ''}`} onAnimationEnd={() => setReceiptPrinting(false)}><div className="receipt-logo"><span className="brand-mark"><Plus size={20}/></span><b>{pharmacy.name}</b></div><div className="receipt-muted">{pharmacy.address}<br/>{pharmacy.phone}</div><hr/><div className="receipt-muted">Receipt: {receipt.receiptNumber}<br/>Date: {new Date(receipt.createdAt).toLocaleString('en-GH')}<br/>Cashier: {receipt.user?.name ?? user.name}</div><hr/>{receipt.items?.map(item => <div className="receipt-line" key={item.id}><span>{item.medicine.name} × {item.quantity}</span><b>{money(Number(item.unitPrice ?? 0) * item.quantity)}</b></div>)}<hr/><div className="receipt-line"><span>Subtotal</span><b>{money(receipt.subtotal ?? receipt.total)}</b></div><div className="receipt-line"><span>Tax</span><b>{money(receipt.tax ?? 0)}</b></div><div className="receipt-line receipt-total"><span>Total</span><b>{money(receipt.total)}</b></div><p className="receipt-thanks">{pharmacy.receiptFooter}</p></div><div className="form-actions receipt-actions"><button className="button button-secondary" onClick={() => { setReceipt(null); setReceiptPrinting(false); }}>Close</button><button className="button button-primary" onClick={() => window.print()}><Printer size={15}/> Print receipt</button></div></Modal>}
      {notice && <div className="toast" role="status" aria-live="polite" aria-atomic="true"><span className="toast-icon" aria-hidden="true"><Bell size={17}/></span><span className="toast-message"><strong>Notification</strong><span>{notice}</span></span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={17}/></button></div>}
      {loading && <span className="sr-only" role="status">Loading pharmacy data</span>}
    </div>;
}

function Metric({ icon, label, value, delta, note, positive, alert }: { icon: React.ReactNode; label: string; value: string; delta: string; note: string; positive?: boolean; alert?: boolean }) {
  return <section className="metric-card"><div className="metric-top"><span className={`metric-icon ${alert ? 'metric-icon-alert' : ''}`}>{icon}</span><button className="icon-button more-compact" aria-label={`${label} options`}><MoreHorizontal size={18}/></button></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot"><span className={`metric-change ${alert ? 'change-alert' : positive ? 'change-positive' : ''}`}>{positive && <ArrowUpRight size={13}/>} {delta}</span><span>{note}</span></div></section>;
}

function TopProducts({ products, onViewReport }: { products: TopProduct[]; onViewReport: () => void }) {
  return <section className="panel top-products"><div className="panel-head"><div><h2>Top selling medicines</h2><p>Best performers this week</p></div><button className="icon-button" aria-label="More options"><MoreHorizontal size={20}/></button></div>{products.length ? products.slice(0, 5).map((product, i) => <div className="product-row" key={product.name}><span className={`product-icon product-icon-${i % 4}`}><Stethoscope size={17}/></span><span className="product-name"><b>{product.name}</b><small>{product.category}</small></span><span className="product-units">{product.units} <small>units</small></span></div>) : <div className="empty-state"><Package size={23}/><b>No sales recorded</b><span>Top sellers appear here after checkout.</span></div>}<button className="text-link" onClick={onViewReport}>View sales report <ArrowUpRight size={14}/></button></section>;
}
