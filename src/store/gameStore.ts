import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// import Pusher from 'pusher-js';
import * as PusherType from 'pusher-js';
const Pusher = PusherType.default || PusherType;
// -------------------------- 1. 初始化 Pusher（对齐官方示例） --------------------------
// 开启日志便于调试（和官方示例一致）
Pusher.logToConsole = true;

// 初始化 Pusher 客户端（使用公开频道，无需认证，和官方示例逻辑对齐）
const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  forceTLS: true, // Web 环境推荐启用 TLS，官方示例默认也会用 TLS
  activityTimeout: 30000, // 30秒无活动才断开（默认120秒，缩短适配移动端）
  pongTimeout: 10000,    // 10秒内没收到Pong就重连（默认30秒，加快重连速度）
  wsPort: 443,           // 强制使用443端口（避免部分网络屏蔽其他端口）
  wssPort: 443,
  authEndpoint: '/api/pusher/auth',
  auth: {
    headers: {
      'X-CSRF-Token': typeof document !== 'undefined' 
        ? document.cookie.split('; ').find(row => row.startsWith('__Host-next-auth.csrf-token='))?.split('=')[1]?.split('%3A')[1] 
        : ''
    }
  }
});

export { pusher };

// -------------------------- 2. 简化玩家 ID 生成（避免 Hydration 问题） --------------------------
// 简化玩家 ID：客户端用固定规则生成，服务器端用静态值，避免随机导致不匹配
const getOrCreatePlayerId = () => {
  if (typeof window === 'undefined') {
    return 'server-temp-0000'; // 服务器端固定临时 ID，确保渲染一致
  }

  const storedId = localStorage.getItem('suishou_player_id');
  if (storedId) {
    return storedId;
  }

  // 生成固定格式 ID（用时间戳后4位，避免随机值）
  const newId = `p-${Date.now().toString().slice(-4)}`;
  localStorage.setItem('suishou_player_id', newId);
  return newId;
};

// -------------------------- 3. 类型定义（保持简洁） --------------------------
interface Card {
  id: string;
  value: string; // 如 "3"、"A"、"小王"
  suit: string;  // 如 "红桃"、"黑桃"（大小王为空）
}

interface Player {
  id: string;
  name: string; // 如 "玩家1234"
  joinedAt: number; // 记录加入时间
}

export type { Card, Player };

interface GameState {
  // 房间与玩家状态
  roomId: string | null;
  isInRoom: boolean;
  currentPlayer: Player;
  otherPlayers: Player[];

  // 游戏核心状态
  handCards: Card[];
  tableCards: { playerId: string; card: Card }[];

  // 核心方法
  createRoom: () => string;
  joinRoom: (roomId: string) => boolean; // 简化为同步返回，避免异步嵌套
  leaveRoom: () => void;
  receiveCards: (cards: Card[]) => void;
  playCard: (card: Card) => void;
}

// -------------------------- 新增：工具函数 - 生成不重复的全局牌库（关键！） --------------------------
// 生成完整54张扑克牌库（去重，确保所有玩家手牌不重复）
const generateFullCardDeck = (): Card[] => {
  const values = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王'];
  const suits = ['红桃', '方块', '黑桃', '梅花'];
  const deck: Card[] = [];

  values.forEach(value => {
    if (value.includes('王')) {
      // 大小王：无花色，唯一ID
      deck.push({
        id: `card-${value}-${Date.now()}`,
        value,
        suit: ''
      });
    } else {
      // 普通牌：4种花色
      suits.forEach(suit => {
        deck.push({
          id: `card-${value}-${suit}-${Date.now()}`,
          value,
          suit
        });
      });
    }
  });

  // 随机打乱牌库（模拟洗牌）
  return deck.sort(() => Math.random() - 0.5);
};

// -------------------------- 新增：发牌主函数（分发给2个玩家，每人10张） --------------------------
const dealCardsToPlayers = (
  set: (fn: (state: GameState) => Partial<GameState>) => void,
  get: () => GameState
) => {
  const currentState = get();
  const channel = pusher.channel(`private-room-${currentState.roomId}`);
  if (!channel || currentState.otherPlayers.length !== 1) return; // 仅当玩家数=2时发牌

  // 1. 生成完整打乱的牌库
  const fullDeck = generateFullCardDeck();
  // 2. 分牌：玩家1（当前玩家）拿前10张，玩家2拿后10张
  const player1Cards = fullDeck.slice(0, 10);
  const player2Cards = fullDeck.slice(10, 20);
  const player2Id = currentState.otherPlayers[0].id; // 第二个玩家ID

  console.log(`[发牌] 玩家${currentState.currentPlayer.id}：10张牌；玩家${player2Id}：10张牌`);

  // 3. 更新当前玩家手牌
  set(() => ({ handCards: player1Cards }));

  // 4. 发送「给对方发牌」事件（同步手牌给第二个玩家）
  channel.trigger('client-deal-cards', {
    targetPlayerId: player2Id,
    cards: player2Cards
  });
};

// -------------------------- 4. Zustand Store（简化状态更新） --------------------------
export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      // 初始状态（简洁化）
      roomId: null,
      isInRoom: false,
      currentPlayer: {
        id: getOrCreatePlayerId(),
        name: `玩家${getOrCreatePlayerId().slice(-4)}`, // 用 ID 后4位做名称，确保一致
        joinedAt: Date.now()
      },
      otherPlayers: [],
      handCards: [],
      tableCards: [],



      
      createRoom: () => {
        const currentState = get();
        if (currentState.isInRoom && currentState.roomId) {
          return currentState.roomId;
        }

        const roomId = Math.floor(100000 + Math.random() * 900000).toString();
        const channelName = `private-room-${roomId}`;
        
        // Subscribe to the channel directly
        const channel = pusher.subscribe(channelName);
        channel.unbind_all();
        console.log(`[A-绑定事件] 开始为房间 ${roomId} 绑定事件`);

        // 1. Bind player joined event first
        const handlePlayerJoined = (player: Player) => {
          const latestState = get();
          console.log(`[A-收到事件] 玩家加入：${JSON.stringify(player)}`);
          if (player.id === latestState.currentPlayer.id) return;
          channel.trigger('client-player-joined', {
            ...currentState.currentPlayer,
            joinedAt: Date.now()
          });
          set((prevState) => {
            const isPlayerExists = prevState.otherPlayers.some(p => p.id === player.id); 
            if (isPlayerExists) return prevState;
            const newOtherPlayers = [...prevState.otherPlayers, player];
            if (newOtherPlayers.length === 1) {
              setTimeout(() => dealCardsToPlayers(set, get), 100); // 延迟确保状态更新完成
            }
            return { otherPlayers: newOtherPlayers };
          });
        };
        channel.bind('client-player-joined', handlePlayerJoined);

        // 2. Bind subscription success event
        const handleSubSuccess = () => {
          console.log(`[A-订阅成功] 房间 ${roomId} 订阅完成，发送玩家加入事件`);
          // Send player joined event after subscription is successful
          channel.trigger('client-player-joined', {
            ...currentState.currentPlayer,
            joinedAt: Date.now()
          });
        };
        channel.bind('pusher:subscription_succeeded', handleSubSuccess);

        // 3. Bind card played event
        channel.bind('client-card-played', (data: { playerId: string; card: Card }) => {
          console.log(`[A-收到事件] 出牌：${JSON.stringify(data)}`);
          set((prevState) => ({
            tableCards: [...prevState.tableCards, data]
          }));
        });

        channel.bind('client-deal-cards', (data: { targetPlayerId: string; cards: Card[] }) => {
          const latestState = get();
          if (data.targetPlayerId !== latestState.currentPlayer.id) return; // 仅接收给自己的牌
          console.log(`[A-收到发牌] 获得 ${data.cards.length} 张牌`);
          set({ handCards: data.cards });
        });

        // Update state
        set({ roomId, isInRoom: true });
        return roomId;
      },

      joinRoom: (roomId: string) => {
        const currentState = get();
        if (currentState.isInRoom && currentState.roomId === roomId) {
          return true;
        }

        try {
          // 1. Unsubscribe from previous room
          if (currentState.roomId) {
            const oldChannel = pusher.channel(`private-room-${currentState.roomId}`);
            if (oldChannel) {
              oldChannel.unbind_all();
              pusher.unsubscribe(`private-room-${currentState.roomId}`);
            }
          }

          // 2. Subscribe to new room
          const channel = pusher.subscribe(`private-room-${roomId}`);
          channel.unbind_all();
          console.log(`[绑定事件] 开始为房间 ${roomId} 绑定事件`);

          // Keep track of players we've already added
          const addedPlayers = new Set<string>();

          // 3. Handle player joined events
          const handlePlayerJoined = (player: Player & { joinedAt?: number }) => {
            const latestState = get();
            console.log(`收到玩家加入通知：${JSON.stringify(player)}`);
            
            // Skip if it's our own join event or already added
            if (player.id === latestState.currentPlayer.id || addedPlayers.has(player.id)) {
              return;
            }
            channel.trigger('client-player-joined', {
              ...currentState.currentPlayer,
              joinedAt: Date.now()
            });
            addedPlayers.add(player.id);
            
            set((prevState) => {
              const isPlayerExists = prevState.otherPlayers.some(p => p.id === player.id);
              if (isPlayerExists) return prevState;
              const newOtherPlayers = [
                ...prevState.otherPlayers, 
                { ...player, joinedAt: player.joinedAt || Date.now() }
              ].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
              if (newOtherPlayers.length === 1) {
                setTimeout(() => dealCardsToPlayers(set, get), 100);
              }
              return { 
                otherPlayers: newOtherPlayers
              };
            });
          };

          // Bind player joined event
          channel.bind('client-player-joined', handlePlayerJoined);
          // 4. Handle subscription success
          const handleSubscriptionSuccess = () => {
            console.log(`已成功订阅房间 ${roomId}，发送玩家加入事件`);
            // Send player joined event after subscription is successful
            console.log(`[B-触发事件] 发送加入通知：${JSON.stringify(currentState.currentPlayer)}`);
            
            const playerWithTimestamp = {
              ...currentState.currentPlayer,
              joinedAt: Date.now()
            };
            channel.trigger('client-player-joined', playerWithTimestamp);
          };

          // Bind subscription success event
          channel.bind('pusher:subscription_succeeded', handleSubscriptionSuccess);
          
          // 5. Bind card played event
          channel.bind('client-card-played', (data: { playerId: string; card: Card }) => {
            console.log(`收到出牌通知：${JSON.stringify(data)}`);
            set((prevState) => ({
              tableCards: [...prevState.tableCards, data]
            }));
          });

          channel.bind('pusher:subscription_error', (error: PusherType.default) => {
            console.error(`订阅房间 ${roomId} 错误：`, error);
          });

          channel.bind('client-deal-cards', (data: { targetPlayerId: string; cards: Card[] }) => {
            const latestState = get();
            if (data.targetPlayerId !== latestState.currentPlayer.id) return; // 仅接收给自己的牌
            console.log(`[B-收到发牌] 获得 ${data.cards.length} 张牌`);
            set({ handCards: data.cards });
          });

          // 5. Update state
          set({
            roomId,
            isInRoom: true,
            otherPlayers: [],
            tableCards: []
          });

          return true;
        } catch (error) {
          console.error('加入房间失败:', error);
          return false;
        }
      },

      // -------------------------- 离开房间（极简逻辑） --------------------------
      leaveRoom: () => {
        const currentState = get();
        // 防重复操作：不在房间则直接返回
        if (!currentState.isInRoom || !currentState.roomId) {
          return;
        }

        // 1. 取消频道订阅
        pusher.unsubscribe(`private-room-${currentState.roomId}`);
        // 2. 重置所有状态（一次性更新，避免循环）
        set({
          roomId: null,
          isInRoom: false,
          otherPlayers: [],
          tableCards: [],
          handCards: []
        });
      },

      // -------------------------- 接收卡牌（简单状态更新） --------------------------
      receiveCards: (cards) => {
        set({ handCards: cards });
      },

      // -------------------------- 出牌（对齐官方 trigger 逻辑） --------------------------
      playCard: (card) => {
        const currentState = get();
        // 防无效操作：不在房间/没房间号则返回
        if (!currentState.isInRoom || !currentState.roomId) {
          return;
        }

        // 1. 更新本地手牌（过滤已出的牌）
        const updatedHandCards = currentState.handCards.filter(c => c.id !== card.id);
        set({ handCards: updatedHandCards });

        // 2. 广播出牌事件（和官方示例 trigger 逻辑一致）
        const channel = pusher.channel(`private-room-${currentState.roomId}`);
        if (channel) {
          channel.trigger('client-card-played', {
            playerId: currentState.currentPlayer.id,
            card: card
          });
        }
      }
    }),
    {
      // 持久化配置：只存玩家信息，避免房间状态混乱
      name: 'suishou-game-storage',
      partialize: (state) => ({ currentPlayer: state.currentPlayer })
    }
  )
);