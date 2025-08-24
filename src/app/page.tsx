'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/store/gameStore';

export default function HomePage() { 
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const { createRoom, joinRoom } = useGameStore();

  // 处理创建房间
  const handleCreateRoom = () => {
    const newRoomId = createRoom();
    router.push(`/room/${newRoomId}`);
  };

  // 处理加入房间
  const handleJoinRoom = async () => {
    if (!roomId.trim()) {
      setError('请输入房间号');
      return;
    }
    
    try {
      setError('');
      await joinRoom(roomId.trim());
      router.push(`/room/${roomId.trim()}`);
    } catch (err) {
      setError('加入房间失败，请检查房间号是否正确');
      console.error('Join room error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 border-2 border-red-200">
        <h1 className="text-3xl font-bold text-center mb-8 text-red-800">
          守岁棋牌
        </h1>
        
        <div className="space-y-6">
          {/* 创建房间按钮 */}
          <button
            onClick={handleCreateRoom}
            className="w-full py-3 bg-red-600 text-white rounded-lg text-lg font-medium hover:bg-red-700 transition-colors duration-300 flex items-center justify-center gap-2"
          >
            <span>创建房间</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          
          {/* 加入房间表单 */}
          <div className="space-y-3">
            <label className="block text-gray-700 font-medium">加入房间</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="输入6位房间号"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                maxLength={6}
              />
              <button
                onClick={handleJoinRoom}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-300"
              >
                加入
              </button>
            </div>
            
            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
          </div>
        </div>
        
        <div className="mt-8 text-center text-gray-500 text-sm">
          春节守岁，阖家欢乐
        </div>
      </div>
    </div>
  );
}
    