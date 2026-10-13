'use client';
import Link from 'next/link';
import { useQuery } from '@apollo/client/react';
import { Camera, LogOut } from 'lucide-react';
import { MeDocument } from '@/shared/api/generated';
import { Button } from '@/shared/ui/button';
import { useState } from 'react';
export function Shell({ children }: { children: React.ReactNode }) {
  const { data } = useQuery(MeDocument);
  const [error, setError] = useState('');
  async function handleLogout() {
    try {
      const response = await fetch('/backend/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('로그아웃에 실패했습니다.');
      window.location.assign('/');
    } catch {
      setError('로그아웃에 실패했습니다. 다시 시도해 주세요.');
    }
  }
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/">
            <span className="brand-icon">
              <Camera size={21} />
            </span>
            웃긴순간<span className="beta">BETA</span>
          </Link>
          <nav className="row">
            <Link className="nav-link" href="/">
              내 그룹
            </Link>
            {data?.me && (
              <>
                <span className="avatar">{data.me.nickname.slice(0, 1)}</span>
                <span className="nickname">{data.me.nickname}</span>
                <Button variant="ghost" onClick={handleLogout} aria-label="로그아웃">
                  <LogOut size={18} />
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <main className="container">{children}</main>
      <footer className="footer">
        <span>웃긴순간</span>
        <span>우리끼리 웃고, 오래 기억하기.</span>
        <span>비공개 그룹 · 사진 1장 · 투표 1표</span>
      </footer>
    </>
  );
}
