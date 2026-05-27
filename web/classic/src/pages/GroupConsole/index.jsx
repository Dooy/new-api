import React, { useState } from 'react';
import {
  Card,
  Form,
  Button,
  Typography,
  Banner,
} from '@douyinfe/semi-ui';
import { API } from '../../helpers';
import GroupStatPanel from './GroupStatPanel';

const { Title, Text } = Typography;

const STORAGE_KEY = 'group_console_auth';

function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.group || !parsed.password) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export default function GroupConsole() {
  const [auth, setAuth] = useState(() => loadAuth());
  const [group, setGroup] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleLogin() {
    if (!group.trim() || !password.trim()) {
      setErrorMsg('请输入组名和密码');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await API.post('/api/group/verify', {
        group: group.trim(),
        password: password.trim(),
      });
      const { success, message } = res.data;
      if (success) {
        const cred = { group: group.trim(), password: password.trim() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cred));
        setAuth(cred);
      } else {
        setErrorMsg(message || '组名或密码错误');
      }
    } catch {
      setErrorMsg('请求失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
    setGroup('');
    setPassword('');
  }

  if (auth) {
    return <GroupStatPanel auth={auth} onLogout={handleLogout} />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Card style={{ width: 360 }}>
        <Title heading={4} style={{ marginBottom: 24, textAlign: 'center' }}>
          组统计控制台
        </Title>
        <Form>
          <Form.Input
            label='组名'
            placeholder='请输入组名'
            value={group}
            onChange={(v) => { setGroup(v); setErrorMsg(''); }}
          />
          <Form.Input
            label='密码'
            placeholder='请输入组密码'
            mode='password'
            value={password}
            onChange={(v) => { setPassword(v); setErrorMsg(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          {errorMsg && (
            <Banner
              type='danger'
              description={errorMsg}
              style={{ marginBottom: 12, borderRadius: 6 }}
            />
          )}
          <Button
            block
            theme='solid'
            loading={loading}
            onClick={handleLogin}
            style={{ marginTop: 8 }}
          >
            登录
          </Button>
        </Form>
        <Text
          type='tertiary'
          size='small'
          style={{ display: 'block', marginTop: 16, textAlign: 'center' }}
        >
          仅可查看本组用户的统计数据
        </Text>
      </Card>
    </div>
  );
}
