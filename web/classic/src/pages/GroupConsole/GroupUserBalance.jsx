import React, { useState, useEffect } from 'react';
import { Card, Typography, Spin, Progress } from '@douyinfe/semi-ui';
import { API, showError } from '../../helpers';
import { getQuotaPerUnit } from '../../helpers/quota';

const { Text } = Typography;

// 每位用户的额度基准（美元）
//const USD_PER_USER = 200;
const USD_PER_USER = 400;

function quotaToUsd(quota) {
  return (quota || 0) / getQuotaPerUnit();
}

export default function GroupUserBalance({ auth }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true);
      setError('');
      try {
        const res = await API.get('/api/group/users', {
          headers: {
            'X-Group-Name': auth.group,
            'X-Group-Password': auth.password,
          },
        });
        if (res.data.success) {
          setUsers(res.data.data || []);
        } else {
          setError(res.data.message || '获取用户余额失败');
          showError(res.data.message || '获取用户余额失败');
        }
      } catch {
        setError('请求失败，请稍后重试');
        showError('请求失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, [auth]);

  const totalUsd = users.reduce((sum, u) => sum + quotaToUsd(u.quota), 0);
  const totalCapacityUsd = USD_PER_USER * users.length;
  const overallPercent = totalCapacityUsd > 0
    ? Math.min(100, Math.round((totalUsd / totalCapacityUsd) * 100))
    : 0;

  return (
    <Card
      style={{ borderRadius: 16, marginTop: 16 }}
      title={<span>用户余额</span>}
    >
      <Spin spinning={loading}>
        {error ? (
          <Text type='danger'>{error}</Text>
        ) : (
          <>
            {/* 汇总统计 */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
              <div>
                <Text type='secondary'>用户数</Text>
                <div style={{ fontSize: 22, fontWeight: 600 }}>{users.length}</div>
              </div>
              <div>
                <Text type='secondary'>总余额 (USD)</Text>
                <div style={{ fontSize: 22, fontWeight: 600 }}>${totalUsd.toFixed(2)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Text type='secondary'>整体余额进度（{overallPercent}%，基准 ${USD_PER_USER}/人）</Text>
                <Progress
                  percent={overallPercent}
                  showInfo={false}
                  style={{ marginTop: 6 }}
                  strokeColor={overallPercent >= 80 ? '#10b981' : overallPercent >= 40 ? '#f59e0b' : '#ef4444'}
                />
              </div>
            </div>

            {/* 用户列表 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {users.map((user) => {
                const usd = quotaToUsd(user.quota);
                const pct = Math.min(100, Math.round((usd / USD_PER_USER) * 100));
                return (
                  <div key={user.username} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Text style={{ width: 140, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.username}
                    </Text>
                    <div style={{ flex: 1 }}>
                      <Progress
                        percent={pct}
                        showInfo={false}
                        size='small'
                        strokeColor={pct >= 80 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444'}
                      />
                    </div>
                    <Text type='secondary' style={{ width: 110, textAlign: 'right', flexShrink: 0 }}>
                      ${usd.toFixed(2)} / ${USD_PER_USER}
                    </Text>
                  </div>
                );
              })}
              {users.length === 0 && !loading && (
                <Text type='tertiary' style={{ textAlign: 'center', padding: '16px 0' }}>
                  该组暂无用户
                </Text>
              )}
            </div>
          </>
        )}
      </Spin>
    </Card>
  );
}
