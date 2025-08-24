'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameStore, pusher, type Player, type Card } from '@/store/gameStore';

// 玩家信息组件 - 延迟渲染以避免Hydration错误
const PlayerInfo = ({ roomId, currentPlayer, onLeave }: {
  roomId: string;
  currentPlayer: { id: string; name: string };
  onLeave: () => void;
}) => {
  // 用于延迟渲染的状态
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // 客户端hydration完成后再渲染
    setIsClient(true);
  }, []);

  // 服务器端和客户端hydration期间显示占位符
  if (!isClient) {
    return (
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-red-800">房间 {roomId}</h1>
          <p className="text-gray-600">你是: 加载中...</p>
        </div>
        <button
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          disabled
        >
          加载中...
        </button>
      </div>
    );
  }

  // 客户端hydration完成后显示真实内容
  return (
    <div className="flex justify-between items-center">
      <div>
        <h1 className="text-xl font-bold text-red-800">房间 {roomId}</h1>
        <p className="text-gray-600">你是: {currentPlayer.name}</p>
      </div>
      <button
        onClick={onLeave}
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
      >
        离开房间
      </button>
    </div>
  );
};

// 生成示例卡牌
const generateSampleCards = (): Card[] => {
  const values = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王'];
  const suits = ['红桃', '方块', '黑桃', '梅花'];
  
  const cards: Card[] = [];
  while (cards.length < 10) {
    const value = values[Math.floor(Math.random() * values.length)];
    const suit = value.includes('王') ? '' : suits[Math.floor(Math.random() * suits.length)];
    const id = `card-${value}-${suit}-${Date.now()}-${cards.length}`;
    
    if (!cards.some(c => c.value === value && c.suit === suit)) {
      cards.push({ id, value, suit });
    }
  }
  
  return cards;
};

export default function RoomPage() {
  const { roomId } = useParams();
  const router = useRouter();
  const { 
    isInRoom, 
    currentPlayer, 
    otherPlayers, 
    handCards, 
    tableCards, 
    joinRoom, 
    leaveRoom, 
    receiveCards, 
    playCard 
  } = useGameStore();
  const [isHydrated, setIsHydrated] = useState(false);
  // 在 RoomPage 组件顶部新增状态：标记是否已绑定

  // 标记客户端hydration完成
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // 处理加入房间
  useEffect(() => {
    if (typeof roomId !== 'string' || !isHydrated) {
      return;
    }
    
    if (!isInRoom && roomId) {
      const result = joinRoom(roomId);
      if (!result) {
        console.error('Failed to join room');
      }
    }
    
    return () => {
      if (isInRoom) {
        leaveRoom();
      }
    };
  }, [roomId, isInRoom, joinRoom, receiveCards, router, isHydrated]);
  // 处理离开房间
  const handleLeave = () => {
    router.push('/');
    setTimeout(() => {
      leaveRoom();
  }, 100);
  };

  if (typeof roomId !== 'string') {
    return <div className="min-h-screen flex items-center justify-center">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-red-50 p-4">
      {/* 顶部信息栏 - 使用延迟渲染的玩家信息组件 */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <PlayerInfo 
          roomId={roomId} 
          currentPlayer={currentPlayer} 
          onLeave={handleLeave} 
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 左侧玩家列表 */}

        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-4 h-full">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">玩家列表</h2>
            <div className="space-y-3">
              {/* 当前玩家 */}
              <div className="flex items-center gap-2 p-2 bg-red-50 rounded border border-red-200">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>{isHydrated ? `${currentPlayer.name} (你)` : '加载中...'}</span>
              </div>
              
              {/* 其他玩家 */}
              {isHydrated ? (
                otherPlayers.map((player) => (
                  <div key={player.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span>{player.name}</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm italic">加载玩家列表中...</p>
              )}
              
              {isHydrated && otherPlayers.length === 0 && (
                <p className="text-gray-500 text-sm italic">等待其他玩家加入...</p>
              )}
            </div>
          </div>
        </div>
        
        {/* 右侧游戏区域 */}
        <div className="lg:col-span-3 space-y-6">
          {/* 牌桌区域 */}
          <div className="bg-white rounded-lg shadow p-6 min-h-[200px]">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">牌桌</h2>
            <div className="border-2 border-red-100 rounded-lg p-4 min-h-[120px] bg-red-50">
              {isHydrated && tableCards.length > 0 ? (
                <div className="space-y-2">
                  {tableCards.map((item, index) => (
                    <div key={index} className="text-gray-800">
                      <span className="font-medium">{otherPlayers.find(p => p.id === item.playerId)?.name || '未知玩家'}</span>
                      出了: <span className="text-red-600">{item.card.suit}{item.card.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm italic text-center py-4">
                  {isHydrated ? '游戏尚未开始，请等待其他玩家加入...' : '加载中...'}
                </p>
              )}
            </div>
          </div>
          
          {/* 手牌区域 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">你的手牌</h2>
            {isHydrated ? (
              <div className="flex flex-wrap gap-3">
                {handCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => playCard(card)}
                    className="w-16 h-24 bg-white border-2 border-red-300 rounded-lg shadow hover:border-red-600 hover:shadow-md transition-all flex flex-col items-center justify-center"
                  >
                    <span className={`text-lg font-bold ${
                      card.suit === '红桃' || card.suit === '方块' 
                        ? 'text-red-600' 
                        : 'text-black'
                    }`}>
                      {card.value}
                    </span>
                    {card.suit && (
                      <span className={`text-sm ${
                        card.suit === '红桃' || card.suit === '方块' 
                          ? 'text-red-600' 
                          : 'text-black'
                      }`}>
                        {card.suit}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {/* 显示占位符卡片 */}
                {Array(10).fill(0).map((_, i) => (
                  <div key={i} className="w-16 h-24 bg-gray-100 border-2 border-gray-300 rounded-lg animate-pulse"></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
    