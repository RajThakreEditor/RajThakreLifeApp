'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { name: 'Dashboard', href: '/' },
  { name: 'Tasks', href: '/tasks' },
  { name: 'Habits', href: '/habits' },
  { name: 'Goals', href: '/Goals' },
  { name: 'Health', href: '/Health' },
  { name: 'Finance', href: '/finance' },
  { name: 'Debt', href: '/Debt' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-title">User Name</div>
        <div className="sidebar-subtitle">Keep Going</div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`sidebar-link ${active ? 'sidebar-link-active' : ''}`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
