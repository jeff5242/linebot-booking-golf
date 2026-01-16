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
      // First, check if local user applies to DB
      // If DB is wiped but LocalStorage remains, we need to clear LocalStorage
      const localPhone = localStorage.getItem('golf_user_phone');
      if (localPhone) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('phone', localPhone)
          .maybeSingle();

        if (!user) {
          console.log('Local user not found in DB (DB wiped?), clearing local storage.');
          localStorage.removeItem('golf_user_phone');
          localStorage.removeItem('golf_user_name');
          localStorage.removeItem('line_user_id');
          // Force reload to clear state effectively
          window.location.reload();
          return;
        }
      }

      await liff.init({ liffId: import.meta.env.VITE_LIFF_ID });
      if (!liff.isLoggedIn()) {
        // check if we are in dev mode or mock mode
        // For now, auto login is only possible in LINE browser
        // In external browser, we might rely on mock ID if not redirecting
        // liff.login();
      } else {
        const profile = await liff.getProfile();
        localStorage.setItem('line_user_id', profile.userId);

        // Check if registered
        const { data: user } = await supabase
          .from('users')
          .select('phone, display_name')
          .eq('line_user_id', profile.userId)
          .single();

        if (user) {
          localStorage.setItem('golf_user_phone', user.phone);
          localStorage.setItem('golf_user_name', user.display_name);
          setIsRegistered(true); // Set registered if user found
        } else {
          // Not registered, but logged in LINE
          setIsRegistered(false); // Explicitly set to false if not registered
        }
      }
    } catch (error) {
      console.error('LIFF Init Error:', error);
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
