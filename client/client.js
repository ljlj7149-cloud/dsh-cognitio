/* dsh-cognitio-core client 设置页 v0.2（2026-08-27）
   依据真机反馈重构：① 记忆库按类型筛选 ② 规则分「生效中/待审批」两组+行内展开
   ③ 全中文（类型/状态/审计动作翻译）④ 行内展开替代 alert ⑤ 顶部状态行。
   手写产物：ModuleLoader.load 格式 + React.createElement（无 JSX）。 */
(function () {
  var require = null;
  var React = null;
  var NS = 'cognitio';
  var zh = {
    nav: 'cognitio 系统', memory: '记忆库', categories: '命题与范畴', rules: '规则', audit: '审计流',
    searching: '搜索（回车）', loading: '加载中…', empty: '（空）', err: '出错了：', refresh: '刷新',
    existing: '生效中的规矩', pending: '待你批的规矩',
    decisions: '待裁决', resolveBtn: '按所选方案执行', suspects: '疑似未走审批即转正（近7天）', confirmBtn: '确认已审（补记）', noRes: '（无）',
    propNames: {
      'propositions/cat1-internal-external-validation': '内部-外部校验缺失',
      'propositions/cat2-intent-action-gap': '意图→行动断层',
      'propositions/cat3-intent-superficial': '意图表面化',
      'propositions/cat4-memory-reality-drift': '记忆-现实脱节',
      'propositions/cat5-multi-write-consistency': '多写入点一致性',
      'propositions/candidate-c4-premature-closure': '过早关闭评估（候选）',
      'propositions/tension-t1-verify-vs-action': '张力T1 验证优先vs行动优先',
    },
    filterAll: '全部', facts: '事实', rulesT: '规矩', patterns: '模式', cases: '案例', props: '命题', checkpoints: '检查点',
    typeOf: { fact: '事实', rule: '规矩', pattern: '模式', case: '案例', proposition: '命题' },
    stOf: { stable: '已生效', draft: '待审批', candidate: '候选', active: '已激活', superseded: '已取代', dormant: '休眠', revised: '已修订' },
    opOf: { write: '写入', 'meta-change': '更新元数据', approve: '批准', reject: '毙掉', forget: '删除(墓碑)', 'request-decision': '请你决策', 'resolve-decision': '已决策', 'confirm-bypass': '补记审批' },
    approve: '批准生效', reject: '毙掉', triggers: '触发词', cex: '失效条件(反例)', nocex: '缺失效条件',
  };
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(tag, props) { var a = [tag, props || null]; for (var i = 2; i < arguments.length; i++) a.push(arguments[i]); return React.createElement.apply(null, a); }
  var btn = { padding: '6px 12px', border: 0, borderRadius: 5, cursor: 'pointer', background: '#2456a6', color: '#e6e6e6', fontSize: 12 };
  var itemCss = { borderBottom: '1px solid #262b36', padding: '8px 10px', cursor: 'pointer' };
  var metaCss = { fontSize: 12, color: '#8b93a5', marginTop: 2 };

  function stColor(s) { return s === 'stable' ? '#1f6f43' : s === 'draft' ? '#c98a2b' : s === 'active' ? '#4f9dff' : s === 'candidate' ? '#7a6bff' : '#6b7280'; }
  function propName(key) { return zh.propNames[key] || key.replace(/^propositions\//, '') || key; }
  function keyLabel(key) {
    if (/^system\/checkpoint\//.test(key)) return '检查点';
    if (/^system\/decision\//.test(key)) return '决策';
    if (/^knowledge\//.test(key)) return '知识';
    return null;
  }
  function typeLabel(type, key) { var k = keyLabel(key); return k || (zh.typeOf[type] || type); }

  function call(op, args) {
    return fetch('/cognitio-panel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: op, args: args || {} }) })
      .then(function (r) { return r.json(); });
  }

  function Section() {
    var s1 = React.useState('memory'); var tab = s1[0]; var setTab = s1[1];
    var s2 = React.useState([]); var items = s2[0]; var setItems = s2[1];
    var s3 = React.useState(null); var stats = s3[0]; var setStats = s3[1];
    var s4 = React.useState(true); var busy = s4[0]; var setBusy = s4[1];
    var s5 = React.useState(''); var q = s5[0]; var setQ = s5[1];
    var s6 = React.useState('all'); var filter = s6[0]; var setFilter = s6[1];
    var s7 = React.useState(null); var openKey = s7[0]; var setOpenKey = s7[1];
    var s8 = React.useState(''); var sel = s8[0]; var setSel = s8[1];
    var s9 = React.useState([]); var susp = s9[0]; var setSusp = s9[1];

    function load(t) {
      setBusy(true);
      var p = t === 'memory' ? call('list', { limit: 100 })
        : t === 'rules' ? call('list', { type: 'rule', limit: 100 })
        : t === 'audit' ? call('audit', { limit: 40 })
        : t === 'decisions' ? call('decisions', { status: 'open' })
        : call('stats', {});
      p.then(function (r) {
        if (t === 'memory') setItems(r && r.chains ? r.chains : []);
        else if (t === 'rules') setItems(r && r.chains ? r.chains : []);
        else if (t === 'audit') setItemsPool(r);
        else if (t === 'decisions') setItemsPool(r);
        else setStats(r);
      }).catch(function (e) { setItems([{ key: 'error', title: String(e) }]); }).finally(function () { setBusy(false); });
    }
    function setItemsPool(r) {
      if (r && r.decisions) setItems(r.decisions.map(function (d) { return { key: d.id, title: d.title, options: d.options || [], status: d.status, ts: d.ts }; }));
      else if (r && r.events) setItems(r.events);
      else setItems([]);
    }
    function resolvePool(sel) {
      var d = (items && items.length && items[0].options) ? items.find(function (x) { return x.key === sel[1][0]; }) : null;
      return d;
    }
    React.useEffect(function () { load(tab); }, [tab]);

    function toggle(key) { setOpenKey(openKey === key ? null : key); }
    function act(op, key) {
      call(op, { key: key }).then(function (r) {
        window.alert(r && r.error ? (zh.err + r.error) : (op === 'approve' ? '已批准生效' : '已毙掉（可恢复）'));
        load(tab);
      });
    }

    var tabs = [['memory', zh.memory], ['categories', zh.categories], ['rules', zh.rules], ['decisions', zh.decisions], ['audit', zh.audit]];
    var tabEls = tabs.map(function (p) {
      return h('button', { key: p[0], onClick: function () { setTab(p[0]); }, style: { padding: '6px 12px', marginRight: 6, border: 0, borderRadius: 5, cursor: 'pointer', background: tab === p[0] ? '#2456a6' : '#2a3040', color: '#e6e6e6' } }, p[1]);
    });

    var memoryBody = null;
    if (tab === 'memory') {
      var chips = [['all', zh.filterAll], ['fact', zh.facts], ['rule', zh.rulesT], ['pattern', zh.patterns], ['case', zh.cases], ['proposition', zh.props], ['checkpoint', zh.checkpoints]];
      var visible = items;
      if (filter === 'checkpoint') visible = items.filter(function (x) { return keyLabel(x.key) === '检查点' || keyLabel(x.key) === '决策'; });
      else if (filter !== 'all') visible = items.filter(function (x) { return x.type === filter; });
      var chipEls = chips.map(function (cp) {
        return h('button', { key: cp[1], onClick: function () { setFilter(cp[0]); }, style: { padding: '4px 10px', marginRight: 6, border: 0, borderRadius: 12, cursor: 'pointer', fontSize: 12, background: filter === cp[0] ? '#2456a6' : '#2a3040', color: '#e6e6e6' } }, cp[1]);
      });
      var rowEls = visible.map(function (it) {
        var open = openKey === it.key;
        return h('div', { key: it.key, style: itemCss, onClick: function () { toggle(it.key); } },
          h('div', null,
            h('span', { style: { fontSize: 11, background: '#22262e', borderRadius: 4, padding: '1px 6px', marginRight: 6, color: '#9aa3b2' } }, typeLabel(it.type, it.key)),
            h('span', null, esc(it.title || it.key)), ' ',
            h('span', { style: { fontSize: 11, color: stColor(it.status) } }, zh.stOf[it.status] || it.status)),
          h('div', { style: metaCss }, esc(it.key), ' · v' + (it.versions ?? '?'),
            (it.status === 'draft' || it.status === 'candidate') ? h('span', { style: { marginLeft: 8 } },
              h('button', { style: { fontSize: 11, padding: '2px 8px', background: '#1f6f43', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }, onClick: function (e) { e.stopPropagation(); act('approve', it.key); } }, zh.approve),
              h('button', { style: { fontSize: 11, padding: '2px 8px', marginLeft: 4, background: '#7a2e2e', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }, onClick: function (e) { e.stopPropagation(); act('reject', it.key); } }, zh.reject)) : null),
          open ? h('div', { style: { marginTop: 6, padding: '8px', background: '#161a22', borderRadius: 6, fontSize: 13, color: '#c9d1dd', whiteSpace: 'pre-wrap' } },
            String(it.content || it.summary || '').slice(0, 900) ? esc(String(it.content || it.summary || '').slice(0, 900)) : null) : null,
        );
      });
      memoryBody = h('div', null,
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' } },
          h('input', { placeholder: zh.searching, value: q, onChange: function (e) { setQ(e.target.value); }, onKeyDown: function (e) { if (e.key === 'Enter') { var v = q.trim(); call('list', { prefix: v || undefined, limit: 100 }).then(function (r) { setItems(r && r.chains ? r.chains : []); }); } }, style: { flex: 1, padding: '6px 10px', borderRadius: 5, border: '1px solid #333a47', background: '#12151c', color: '#e6e6e6' } }),
          h('button', { onClick: function () { load('memory'); }, style: btn }, zh.refresh)),
        h('div', { style: { marginBottom: 8 } }, chipEls),
        busy ? h('div', null, zh.loading) : (visible.length ? h('div', null, rowEls) : h('div', null, zh.empty)),
      );
    }

    var rulesBody = null;
    if (tab === 'rules') {
      var stables = items.filter(function (x) { return x.status === 'stable' || x.status === 'active'; });
      var pendings = items.filter(function (x) { return x.status === 'draft' || x.status === 'candidate'; });
      function ruleRow(it, canApprove) {
        var open = openKey === it.key;
        return h('div', { key: it.key, style: itemCss, onClick: function () { toggle(it.key); } },
          h('div', null,
            h('span', { style: { fontSize: 11, color: stColor(it.status) } }, zh.stOf[it.status] || it.status), ' ',
            h('span', null, esc(it.title || it.key)),
            it.counterexamples ? h('span', { style: { marginLeft: 6, fontSize: 11, color: '#1f6f43' } }, '✓' + zh.cex) : h('span', { style: { marginLeft: 6, fontSize: 11, color: '#c98a2b' } }, '⚠' + zh.nocex),
            canApprove ? h('span', { style: { marginLeft: 8 } },
              h('button', { style: { fontSize: 11, padding: '2px 8px', background: '#1f6f43', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }, onClick: function (e) { e.stopPropagation(); act('approve', it.key); } }, zh.approve),
              h('button', { style: { fontSize: 11, padding: '2px 8px', marginLeft: 4, background: '#7a2e2e', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }, onClick: function (e) { e.stopPropagation(); act('reject', it.key); } }, zh.reject)) : null),
          h('div', { style: metaCss }, esc(it.key)),
          open ? h('div', { style: { marginTop: 6, padding: '8px', background: '#161a22', borderRadius: 6, fontSize: 13, color: '#c9d1dd', whiteSpace: 'pre-wrap' } },
            (it.content || '') ? esc(String(it.content || '').slice(0, 700)) : null,
            it.triggers ? h('div', { style: { marginTop: 6, fontSize: 12 } }, zh.triggers + '：' + esc(it.triggers)) : null,
            it.counterexamples ? h('div', { style: { marginTop: 4, fontSize: 12, color: '#8b93a5' } }, zh.cex + '：' + esc(it.counterexamples)) : null) : null,
        );
      }
      rulesBody = h('div', null, busy ? h('div', null, zh.loading) : h('div', null,
        h('div', { style: { margin: '6px 0', fontSize: 13, color: '#4f9dff' } }, '🔵 ' + zh.existing + '（' + stables.length + ' 条）'),
        stables.map(function (x) { return ruleRow(x, false); }),
        h('div', { style: { margin: '10px 0 6px', fontSize: 13, color: '#c98a2b' } }, '🟡 ' + zh.pending + '（' + pendings.length + ' 条）'),
        pendings.length ? pendings.map(function (x) { return ruleRow(x, true); }) : h('div', { style: { fontSize: 12, color: '#8b93a5' } }, '（无）'),
      ));
    }

    var decisionsBody = null;
    if (tab === 'decisions') {
      var ds = items || [];
      decisionsBody = h('div', null, busy ? h('div', null, zh.loading) : h('div', null,
        h('div', { style: { fontSize: 12, color: '#8b93a5', marginBottom: 6 } }, '等待你拍板的事（决策队列）——从选项里选一个，点执行。'),
        ds.length ? ds.map(function (d) {
          return h('div', { key: d.key, style: { padding: '8px 10px', borderBottom: '1px solid #262b36', fontSize: 13 } },
            esc(d.title || ''), ' · ',
            d.options && d.options.length ? h('select', { id: 'dopt-' + d.key, defaultValue: sel || d.options[0], onChange: function (e) { setSel(e.target.value); }, style: { margin: '0 8px', padding: '3px 6px', background: '#12151c', color: '#e6e6e6', border: '1px solid #333a47', borderRadius: 4 } },
              d.options.map(function (o) { return h('option', { key: o, value: o }, o); })) : null,
            h('button', { style: { padding: '3px 10px', border: 0, borderRadius: 4, cursor: 'pointer', background: '#2456a6', color: '#e6e6e6', fontSize: 12 }, onClick: function (e) { e.stopPropagation(); call('resolve', { id: d.key, resolution: (document && document.querySelector('#dopt-' + d.key)) ? document.querySelector('#dopt-' + d.key).value : (d.options && d.options[0]) }).then(function (r) { window.alert(r && r.error ? (zh.err + r.error) : '已执行所选方案'); load('decisions'); }); } }, zh.resolveBtn),
          );
        }) : h('div', null, zh.noRes),
      ));
    }

    var catBody = null;
    if (tab === 'categories') {
      var cats = (stats && stats.categories) || [];
      catBody = h('div', null,
        stats ? h('div', { style: { marginBottom: 8, fontSize: 12, color: '#8b93a5' } },
          '记忆链 ' + stats.chains + ' 条 · 版本 ' + stats.versions + ' 个 · 陈旧 ' + stats.stale + ' 条 · 近30天案例 ' + stats.cases_last_30d + ' 条' +
          (stats.review_queue && stats.review_queue.length ? ' · 超期待批 ' + stats.review_queue.length + ' 条' : '') +
          (stats.learning_ledger ? ' · 规矩「' + stats.learning_ledger.rules_total + ' 条 / 复用率 ' + stats.learning_ledger.reuse_rate + '」' : '')) : null,
        cats.length ? cats.map(function (c) {
          return h('div', { key: c.key, style: itemCss, onClick: function () { toggle(c.key); } },
            h('div', null, h('span', { style: { color: c.status === 'active' ? '#4f9dff' : '#8b93a5', fontSize: 12 } }, esc(propName(c.key))),
              h('span', { style: { marginLeft: 8, fontSize: 12 } }, '案例 ' + c.case_count + ' · ' + (zh.stOf[c.status] || c.status) + (c.silent_maturation ? ' · 熟透待提取' : ''))),
            c.suggested_transition ? h('div', { style: { fontSize: 12, color: '#c98a2b' } }, esc(c.suggested_transition)) : null,
            openKey === c.key ? h('div', { style: { marginTop: 4, fontSize: 12, color: '#8b93a5' } }, '（这是我们总结出的「毛病类型」：案例越多越值得警惕，需要你裁定是否升级为重点关注）') : null,
          );
        }) : h('div', null, zh.empty),
      );
    }

    var auditBody = null;
    if (tab === 'audit') {
      function checkSuspects() {
        call('anomalies', { days: 7 }).then(function (r) {
          if (!r || r.error) { window.alert(zh.err + (r && r.error || '(需重启后可用)')); return; }
          setSusp((r.anomalies || []));
        });
      }
      function doConfirm(a) {
        call('confirm', { key: a.key, v: a.v }).then(function (r) {
          if (r && r.ok) { window.alert(zh.confirmBtn + ' ✓'); setSusp(susp.filter(function (x) { return x.key !== a.key; })); }
          else window.alert(zh.err + (r && r.error || '(需重启后可用)'));
        });
      }
      var suspSection = h('div', { style: { marginBottom: 10, padding: '8px', background: '#1a1512', borderRadius: 6, fontSize: 12 } },
        h('div', { style: { color: '#c98a2b', marginBottom: 4 } }, '⚠ ' + zh.suspects),
        h('button', { onClick: checkSuspects, style: { padding: '3px 10px', border: 0, borderRadius: 4, cursor: 'pointer', background: '#2a3040', color: '#e6e6e6', fontSize: 12 } }, '检查可疑项'),
        susp.length ? susp.map(function (a) {
          return h('div', { key: a.key, style: { padding: '5px 2px', borderBottom: '1px solid #2a3040' } },
            esc(a.key),
            h('button', { style: { marginLeft: 8, fontSize: 11, padding: '2px 8px', border: 0, borderRadius: 4, background: '#2456a6', color: '#fff', cursor: 'pointer' }, onClick: function () { doConfirm(a); } }, zh.confirmBtn),
          );
        }) : h('div', { id: 'cog-susp', style: { marginTop: 6, color: '#8b93a5' } }, '（点击上方按钮检查）'),
      );
      auditBody = h('div', null, busy ? h('div', null, zh.loading) : h('div', null,
        suspSection,
        h('div', { style: { fontSize: 12, color: '#8b93a5', marginBottom: 6 } }, '这里记录谁在什么时候对哪条记忆做了什么（批准/毙掉/改动都留痕）。'),
        (items || []).map(function (e, i) {
          return h('div', { key: i, style: { padding: '6px 8px', borderBottom: '1px solid #262b36', fontSize: 12 } },
            h('span', { style: { color: '#8b93a5' } }, new Date(e.ts).toLocaleString()), ' · ',
            h('span', { style: { color: '#4f9dff' } }, zh.opOf[e.op] || e.op), ' · ',
            h('span', null, esc(e.actor === 'approval-panel' ? '你(审批)' : (e.actor || '系统'))), ' · ',
            h('span', null, esc(e.key || ('#' + e.seq))),
            e.v ? h('span', { style: { color: '#6b7280' } }, ' v' + e.v) : null,
            e.field ? h('span', { style: { color: '#6b7280' } }, '（' + esc(e.field) + '）') : null,
          );
        }),
      ));
    }

    return h('div', null,
      h('div', { style: { marginBottom: 10 } }, tabEls),
      tab === 'memory' ? memoryBody : tab === 'rules' ? rulesBody : tab === 'decisions' ? decisionsBody : tab === 'categories' ? catBody : auditBody,
    );
  }

  function apply(ctx) {
    ctx.effect(function () { ctx.locale.register(NS, { zh: zh, en: zh }); });
    ctx.slots.inject('settings.section', function () {
      return ctx.slots.register({
        name: 'settings.section', id: 'cognitio', order: 60,
        label: function () { return zh.nav; }, locale: NS, inject: function () { return { t: function (k) { return zh[k] || k; } }; },
      }, function () { return React.createElement(Section, { t: function (k) { return zh[k] || k; } }); });
    });
    return function () {};
  }

  window.__ModuleLoader__.load({ id: 'dsh-cognitio-core', factory: function (requireParam) {
    require = requireParam;
    React = require('react');
    return { apply: apply, inject: ['slots', 'locale'] };
  } });
})();
