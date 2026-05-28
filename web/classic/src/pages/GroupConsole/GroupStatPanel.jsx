import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Typography,
  Spin,
  Tabs,
  Modal,
  Form,
} from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { initVChartSemiTheme } from '@visactor/vchart-semi-theme';
import { PieChart, Search } from 'lucide-react';
import { API, showError } from '../../helpers';
// dooy 2026-05-27 引入用户余额面板组件
import GroupUserBalance from './GroupUserBalance';
import { getQuotaPerUnit } from '../../helpers/quota';
import {
  modelColorMap,
  renderNumber,
  renderQuota,
  modelToColor,
  getQuotaWithUnit,
  timestamp2string,
} from '../../helpers';
import {
  processRawData,
  aggregateDataByTimeAndModel,
  generateChartTimePoints,
  updateChartSpec,
  updateMapValue,
  initializeMaps,
  getDefaultTime,
  getInitialTimestamp,
  processUserData,
} from '../../helpers/dashboard';
import { TIME_OPTIONS } from '../../constants/dashboard.constants';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const CHART_CONFIG = { mode: 'desktop-browser' };

const USER_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
];

function buildInitialPieSpec() {
  return {
    type: 'pie',
    data: [{ id: 'id0', values: [{ type: 'null', value: '0' }] }],
    outerRadius: 0.8, innerRadius: 0.5, padAngle: 0.6,
    valueField: 'value', categoryField: 'type',
    pie: { style: { cornerRadius: 10 } },
    title: { visible: true, text: '模型调用次数占比', subtext: `总计：${renderNumber(0)}` },
    legends: { visible: true },
    tooltip: { mark: { content: [{ key: (d) => d['type'], value: (d) => renderNumber(d['value']) }] } },
    color: { specified: modelColorMap },
  };
}

function buildInitialLineSpec() {
  return {
    type: 'bar',
    data: [{ id: 'barData', values: [] }],
    xField: 'Time', yField: 'Usage', seriesField: 'Model', stack: true,
    legends: { visible: true, selectMode: 'single' },
    title: { visible: true, text: '模型消耗分布', subtext: `总计：${renderQuota(0, 2)}` },
    bar: { state: { hover: { stroke: '#000', lineWidth: 1 } } },
    tooltip: {
      mark: {
        content: [{ key: (d) => d['Model'], value: (d) => renderQuota(d['rawQuota'] || 0, 4) }],
      },
      dimension: {
        content: [{ key: (d) => d['Model'], value: (d) => d['rawQuota'] || 0 }],
        updateContent: (array) => {
          array.sort((a, b) => b.value - a.value);
          let sum = 0;
          for (let i = 0; i < array.length; i++) {
            if (array[i].key === '其他') continue;
            let value = parseFloat(array[i].value);
            if (isNaN(value)) value = 0;
            if (array[i].datum && array[i].datum.TimeSum) {
              sum = array[i].datum.TimeSum;
            }
            array[i].value = renderQuota(value, 4);
          }
          array.unshift({ key: '总计', value: renderQuota(sum, 4) });
          return array;
        },
      },
    },
    color: { specified: modelColorMap },
  };
}

function buildInitialModelLineSpec() {
  return {
    type: 'line',
    data: [{ id: 'lineData', values: [] }],
    xField: 'Time', yField: 'Count', seriesField: 'Model',
    legends: { visible: true, selectMode: 'single' },
    title: { visible: true, text: '调用趋势', subtext: '' },
    color: { specified: modelColorMap },
  };
}

function buildInitialRankSpec() {
  return {
    type: 'bar',
    data: [{ id: 'rankData', values: [] }],
    xField: 'Model', yField: 'Count', seriesField: 'Model',
    legends: { visible: true, selectMode: 'single' },
    title: { visible: true, text: '模型调用次数排行', subtext: '' },
    bar: { state: { hover: { stroke: '#000', lineWidth: 1 } } },
    color: { specified: modelColorMap },
  };
}

function buildInitialUserRankSpec() {
  return {
    type: 'bar',
    data: [{ id: 'userRankData', values: [] }],
    xField: 'rawQuota', yField: 'User', seriesField: 'User',
    direction: 'horizontal',
    legends: { visible: false },
    title: { visible: true, text: '用户消耗排行', subtext: '' },
    bar: { state: { hover: { stroke: '#000', lineWidth: 1 } } },
    label: {
      visible: true, position: 'outside',
      formatMethod: (value, datum) => renderQuota(datum['rawQuota'] || 0, 2),
    },
    axes: [
      { orient: 'left', type: 'band', label: { visible: true } },
      { orient: 'bottom', type: 'linear', visible: false },
    ],
    tooltip: { mark: { content: [{ key: (d) => d['User'], value: (d) => renderQuota(d['rawQuota'] || 0, 4) }] } },
    color: { type: 'ordinal', range: USER_COLORS },
  };
}

const GROUP_CONSOLE_TIME_KEY = 'group_console_time_granularity';

function getGroupTimeGranularity() {
  return localStorage.getItem(GROUP_CONSOLE_TIME_KEY) || 'hour';
}

function getTimeSpanByGranularity(granularity) {
  switch (granularity) {
    case 'week': return 86400 * 30 * 1000;
    case 'day': return 86400 * 7 * 1000;
    case 'hour':
    default: return 86400 * 1000;
  }
}

function buildDefaultInputs() {
  const granularity = getGroupTimeGranularity();
  const now = Date.now();
  const span = getTimeSpanByGranularity(granularity);
  return {
    start_timestamp: new Date(now - span),
    end_timestamp: new Date(now),
    data_export_default_time: granularity,
  };
}

export default function GroupStatPanel({ auth, onLogout }) {
  const [loading, setLoading] = useState(false);
  const [stat, setStat] = useState(null);
  const [activeTab, setActiveTab] = useState('1');
  const [searchVisible, setSearchVisible] = useState(false);

  const [inputs, setInputs] = useState(buildDefaultInputs);
  const [pendingInputs, setPendingInputs] = useState(buildDefaultInputs);

  const [specPie, setSpecPie] = useState(buildInitialPieSpec);
  const [specLine, setSpecLine] = useState(buildInitialLineSpec);
  const [specModelLine, setSpecModelLine] = useState(buildInitialModelLineSpec);
  const [specRankBar, setSpecRankBar] = useState(buildInitialRankSpec);
  const [specUserRank, setSpecUserRank] = useState(buildInitialUserRankSpec);

  useEffect(() => {
    initVChartSemiTheme({ isWatchingThemeSwitch: true });
  }, []);

  const generateModelColors = useCallback((uniqueModels) => {
    const colors = {};
    Array.from(uniqueModels).forEach((name) => {
      colors[name] = modelColorMap[name] || modelToColor(name);
    });
    return colors;
  }, []);

  const updateCharts = useCallback(
    (data, dataExportDefaultTime) => {
      if (!data || data.length === 0) return;

      const processed = processRawData(data, dataExportDefaultTime, initializeMaps, updateMapValue);
      const { totalQuota, totalTimes, uniqueModels } = processed;
      const modelColors = generateModelColors(uniqueModels);
      const aggregatedData = aggregateDataByTimeAndModel(data, dataExportDefaultTime);

      const modelTotals = new Map();
      for (let [, value] of aggregatedData) {
        updateMapValue(modelTotals, value.model, value.count);
      }

      const newPieData = Array.from(modelTotals)
        .map(([model, count]) => ({ type: model, value: count }))
        .sort((a, b) => b.value - a.value);

      const chartTimePoints = generateChartTimePoints(aggregatedData, data, dataExportDefaultTime);

      let newLineData = [];
      chartTimePoints.forEach((time) => {
        let timeData = Array.from(uniqueModels).map((model) => {
          const key = `${time}-${model}`;
          const agg = aggregatedData.get(key);
          return {
            Time: time, Model: model,
            rawQuota: agg?.quota || 0,
            Usage: agg?.quota ? getQuotaWithUnit(agg.quota, 4) : 0,
          };
        });
        const timeSum = timeData.reduce((s, i) => s + i.rawQuota, 0);
        timeData.sort((a, b) => b.rawQuota - a.rawQuota);
        timeData = timeData.map((i) => ({ ...i, TimeSum: timeSum }));
        newLineData.push(...timeData);
      });
      newLineData.sort((a, b) => a.Time.localeCompare(b.Time));

      let modelLineData = [];
      chartTimePoints.forEach((time) => {
        Array.from(uniqueModels).forEach((model) => {
          const key = `${time}-${model}`;
          const agg = aggregatedData.get(key);
          modelLineData.push({ Time: time, Model: model, Count: agg?.count || 0 });
        });
      });
      modelLineData.sort((a, b) => a.Time.localeCompare(b.Time));

      const MAX_RANK = 20;
      const allRank = Array.from(modelTotals)
        .map(([model, count]) => ({ Model: model, Count: count }))
        .sort((a, b) => b.Count - a.Count);
      const rankData = allRank.length > MAX_RANK
        ? [...allRank.slice(0, MAX_RANK), { Model: '其他', Count: allRank.slice(MAX_RANK).reduce((s, i) => s + i.Count, 0) }]
        : allRank;

      // 用户消耗排行
      const { rankingData, trendData: _userTrend } = processUserData(data, dataExportDefaultTime, 10);
      const userRankValues = rankingData
        .map((item) => ({ User: item.User, rawQuota: item.Quota, Quota: getQuotaWithUnit(item.Quota, 4) }))
        .sort((a, b) => b.rawQuota - a.rawQuota);
      const totalUserQuota = rankingData.reduce((s, i) => s + i.Quota, 0);

      updateChartSpec(setSpecPie, newPieData, `总计：${renderNumber(totalTimes)}`, modelColors, 'id0');
      updateChartSpec(setSpecLine, newLineData, `总计：${renderQuota(totalQuota, 2)}`, modelColors, 'barData');
      updateChartSpec(setSpecModelLine, modelLineData, `总计：${renderNumber(totalTimes)}`, modelColors, 'lineData');
      updateChartSpec(setSpecRankBar, rankData, `总计：${renderNumber(totalTimes)}`, modelColors, 'rankData');
      setSpecUserRank((prev) => ({
        ...prev,
        data: [{ id: 'userRankData', values: userRankValues }],
        title: { ...prev.title, subtext: `总计：${renderQuota(totalUserQuota, 2)}` },
      }));

      setStat((prev) => ({ ...prev, quota: totalQuota }));
    },
    [generateModelColors],
  );

  const fetchData = useCallback(async (queryInputs) => {
    const q = queryInputs || inputs;
    const startTimestamp = Math.floor(new Date(q.start_timestamp).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(q.end_timestamp).getTime() / 1000);
    const dataExportDefaultTime = q.data_export_default_time;

    setLoading(true);
    try {
      const headers = { 'X-Group-Name': auth.group, 'X-Group-Password': auth.password };
      const [statRes, chartRes] = await Promise.all([
        API.get(`/api/group/stat?start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}`, { headers }),
        API.get(`/api/group/chart?start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}`, { headers }),
      ]);

      if (!statRes.data.success) {
        showError(statRes.data.message);
        if (statRes.status === 401) onLogout();
        return;
      }
      if (!chartRes.data.success) {
        showError(chartRes.data.message);
        return;
      }

      setStat(statRes.data.data);
      updateCharts(chartRes.data.data || [], dataExportDefaultTime);
    } catch {
      showError('请求失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [auth, inputs, onLogout, updateCharts]);

  useEffect(() => {
    fetchData();
  }, []);  // only on mount; user triggers refresh manually

  const handleSearchConfirm = () => {
    // 保存颗粒度到 localStorage，下次进入时记住
    localStorage.setItem(GROUP_CONSOLE_TIME_KEY, pendingInputs.data_export_default_time);
    setInputs(pendingInputs);
    setSearchVisible(false);
    fetchData(pendingInputs);
  };

  const quotaUSD = stat ? (stat.quota / getQuotaPerUnit()).toFixed(4) : '0';

  const timeOptionList = TIME_OPTIONS.map((o) => ({ label: o.label, value: o.value }));

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      {/* 顶部标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title heading={4}>
          组统计控制台 — <Text type='secondary'>{auth.group}</Text>
        </Title>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            icon={<Search size={14} />}
            onClick={() => { setPendingInputs(inputs); setSearchVisible(true); }}
          >
            搜索条件
          </Button>
          <Button onClick={() => fetchData()} loading={loading}>刷新</Button>
          <Button onClick={onLogout} type='tertiary'>退出登录</Button>
        </div>
      </div>

      {/* 搜索 Modal */}
      <Modal
        title='搜索条件'
        visible={searchVisible}
        onOk={handleSearchConfirm}
        onCancel={() => setSearchVisible(false)}
        closeOnEsc
        centered
        size='small'
      >
        <Form layout='vertical'>
          <Form.DatePicker
            field='start_timestamp'
            label='起始时间'
            value={pendingInputs.start_timestamp}
            initValue={pendingInputs.start_timestamp}
            type='dateTime'
            className='w-full mb-2 !rounded-lg'
            onChange={(v) => setPendingInputs((p) => ({ ...p, start_timestamp: v }))}
          />
          <Form.DatePicker
            field='end_timestamp'
            label='截止时间'
            value={pendingInputs.end_timestamp}
            initValue={pendingInputs.end_timestamp}
            type='dateTime'
            className='w-full mb-2 !rounded-lg'
            onChange={(v) => setPendingInputs((p) => ({ ...p, end_timestamp: v }))}
          />
          <Form.Select
            field='data_export_default_time'
            label='时间粒度'
            value={pendingInputs.data_export_default_time}
            initValue={pendingInputs.data_export_default_time}
            optionList={timeOptionList}
            className='w-full mb-2 !rounded-lg'
            onChange={(v) => setPendingInputs((p) => ({ ...p, data_export_default_time: v }))}
          />
        </Form>
      </Modal>

      <Spin spinning={loading}>
        {/* 统计卡片 */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <Card style={{ flex: '1 1 180px', minWidth: 160 }}>
            <Text type='secondary'>消耗配额 (USD)</Text>
            <div style={{ fontSize: 28, fontWeight: 600, marginTop: 8 }}>${quotaUSD}</div>
          </Card>
          <Card style={{ flex: '1 1 180px', minWidth: 160 }}>
            <Text type='secondary'>RPM（每分钟请求数）</Text>
            <div style={{ fontSize: 28, fontWeight: 600, marginTop: 8 }}>{stat?.rpm ?? 0}</div>
          </Card>
          <Card style={{ flex: '1 1 180px', minWidth: 160 }}>
            <Text type='secondary'>TPM（每分钟 Token 数）</Text>
            <div style={{ fontSize: 28, fontWeight: 600, marginTop: 8 }}>{stat?.tpm ?? 0}</div>
          </Card>
        </div>

        {/* 图表面板 */}
        <Card
          style={{ borderRadius: 16 }}
          title={
            <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between w-full gap-3'>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PieChart size={16} />
                模型数据分析
              </div>
              <Tabs type='slash' activeKey={activeTab} onChange={setActiveTab}>
                <TabPane tab='消耗分布' itemKey='1' />
                <TabPane tab='调用趋势' itemKey='2' />
                <TabPane tab='调用次数分布' itemKey='3' />
                <TabPane tab='调用次数排行' itemKey='4' />
                <TabPane tab='用户消耗排行' itemKey='5' />
              </Tabs>
            </div>
          }
          bodyStyle={{ padding: 0 }}
        >
          <div style={{ height: 384, padding: 8 }}>
            {activeTab === '1' && <VChart spec={specLine} option={CHART_CONFIG} />}
            {activeTab === '2' && <VChart spec={specModelLine} option={CHART_CONFIG} />}
            {activeTab === '3' && <VChart spec={specPie} option={CHART_CONFIG} />}
            {activeTab === '4' && <VChart spec={specRankBar} option={CHART_CONFIG} />}
            {activeTab === '5' && <VChart spec={specUserRank} option={CHART_CONFIG} />}
          </div>
        </Card>
        {/* dooy 2026-05-27 用户余额面板，展示在模型数据分析图表下方 */}
        <GroupUserBalance auth={auth} />
        {/* dooy end */}
      </Spin>
    </div>
  );
}
