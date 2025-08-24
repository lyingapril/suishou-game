import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';

// 初始化Pusher服务器实例（使用secret key）
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true
});

export async function POST(req: NextRequest) {
  const body = await req.text();
  const [socketId, channelName] = body.split('&').map(param => {
    const [value] = param.split('=');
    return decodeURIComponent(value);
  });

  // 简单认证：允许所有用户订阅（实际项目需验证用户身份）
  const auth = pusher.authenticate(socketId, channelName);
  return NextResponse.json(auth);
}