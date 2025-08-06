'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, Shirt, Heart, Sparkles, BookOpen, Settings, User } from 'lucide-react'

const navigation = [
  { name: 'Главная', href: '/admin', icon: Home },
  { name: 'Гардероб', href: '/admin/wardrobe', icon: Shirt },
  { name: 'Образы', href: '/admin/outfits', icon: Heart },
  { name: 'Вдохновение', href: '/admin/inspiration', icon: Sparkles },
  { name: 'Коллекции', href: '/admin/collections', icon: BookOpen },
  { name: 'Профиль', href: '/admin/profile', icon: User },
  { name: 'Настройки', href: '/admin/settings', icon: Settings },
]

export default function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/admin" className="text-xl font-bold text-gray-900">
                ModeMorph
              </Link>
            </div>
            
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium',
                      isActive
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    )}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
