import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Register } from './pages/Register';
import { Booking } from './pages/Booking';
import { MyBookings } from './pages/MyBookings';
import { AdminDashboard } from './pages/Admin';
import { HealthCheck } from './pages/HealthCheck';
import { supabase } from './supabase';

import liff from '@line/liff';

function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    initLiffAndCheckUser();
  }, []);

  async function initLiffAndCheckUser() {
    try {
      // 1. Initialize LIFF
      await liff.init({ liffId: import.meta.env.VITE_LIFF_ID });

      if (!liff.isLoggedIn()) {
        liff.login();
        return; // Wait for redirect
      }

      const profile = await liff.getProfile();
      const lineUserId = profile.userId;
      localStorage.setItem('line_user_id', lineUserId); // Save for API calls

      // 2. Check if user is registered in Supabase
      // First check local phone cache for speed
      const localPhone = localStorage.getItem('golf_user_phone');

      if (localPhone) {
        setIsRegistered(true);
      } else {
        // Double check DB with line_user_id to be safe (sync across devices)
        const { data } = await supabase
          .from('users')
          .select('phone')
          .eq('line_user_id', lineUserId)
          .single();

        if (data?.phone) {
          localStorage.setItem('golf_user_phone', data.phone);
          setIsRegistered(true);
        }
      }
    } catch (err) {
      console.error('LIFF Init Failed', err);
      // Fallback for local testing if LIFF fails (e.g. browser)
      // Check if we have mock in local storage
      if (localStorage.getItem('golf_user_phone')) {
        setIsRegistered(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading...</div>;

  if (!isRegistered) {
    return <Navigate to="/register" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/health" element={<HealthCheck />} />
        <Route path="/my-bookings" element={
          <ProtectedRoute>
            <MyBookings />
          </ProtectedRoute>
        } />
        <Route path="/" element={
          <ProtectedRoute>
            <Booking />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
