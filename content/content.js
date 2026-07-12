/**
 * 问卷自动填写助手 - 内容脚本
 * 负责：检测表单字段、智能匹配答案、自动填写
 */
(function () {
  'use strict';

  // ==================== 配置常量 ====================
  const HIGHLIGHT_CLASS = 'qaf-highlight';
  const HIGHLIGHT_FILLED_CLASS = 'qaf-highlight-filled';
  const PANEL_ID = 'qaf-status-panel';

  // 默认答案模板
  const DEFAULT_PROFILE = {
    name: '张三',
    gender: '男',
    age: '25',
    phone: '13800138000',
    email: 'zhangsan@example.com',
    idCard: '110101199001011234',
    address: '北京市朝阳区某某街道123号',
    school: '北京大学',
    company: '某科技有限公司',
    occupation: '软件工程师',
    city: '北京',
    birthday: '1990-01-01',
    suggestions: '无',
    income: '10000',
    marital: '未婚',
    ethnicity: '汉族',
    political: '群众',
    department: '研发部',
    staffId: '10001',
    emergencyContact: '张三',
  };

  // ==================== 平台检测器 ====================
  const PlatformDetector = {
    detect() {
      const host = location.hostname.toLowerCase();
      const url = location.href.toLowerCase();

      if (host.includes('docs.google.com') || url.includes('/forms/d/')) {
        return 'googleForms';
      }
      if (host.includes('wjx.cn') || host.includes('wjx.top')) {
        return 'wenjuanxing';
      }
      if (host.includes('wj.qq.com') || host.includes('sojump.com')) {
        return 'tencentSurvey';
      }
      if (host.includes('wenjuan.com') || host.includes('sojump.com')) {
        return 'wenjuanwang';
      }
      if (host.includes('s.jumpow.com') || host.includes('jumpow.com')) {
        return 'wenjuanwang';
      }
      return 'generic';
    },

    getInfo() {
      const platform = this.detect();
      const info = {
        googleForms: { name: 'Google Forms', selector: '[role="listitem"]' },
        wenjuanxing: { name: '问卷星', selector: '.div_question, .field' },
        tencentSurvey: { name: '腾讯问卷', selector: '.survey-question, .question-item' },
        wenjuanwang: { name: '问卷网', selector: '.topic, .question' },
        generic: { name: '通用网页', selector: 'form, .form-group, .question' },
      };
      return { platform, ...info[platform] };
    },
  };

  // ==================== 字段检测器 ====================
  const FieldDetector = {
    /**
     * 检测页面上所有可填写的字段
     */
    detectAll() {
      this.clearCache(); // 每次检测前清除缓存
      const fields = [];
      const processedNames = new Set();

      // 检测文本类输入框
      fields.push(...this.detectTextInputs());

      // 检测文本域
      fields.push(...this.detectTextareas());

      // 检测单选按钮组
      fields.push(...this.detectRadioGroups(processedNames));

      // 检测复选框组
      fields.push(...this.detectCheckboxGroups(processedNames));

      // 检测下拉选择框
      fields.push(...this.detectSelects());

      // 检测范围滑块
      fields.push(...this.detectRanges());

      // 检测星级评分题
      fields.push(...this.detectStars());

      // 检测矩阵/量表题
      fields.push(...this.detectMatrix());

      // 检测文件上传（仅记录，不填写）
      const files = this.detectFileUploads();
      if (files.length > 0) {
        console.log('[问卷助手] 检测到 ' + files.length + ' 个文件上传字段（已跳过）');
      }

      return fields;
    },

    detectTextInputs() {
      const inputs = document.querySelectorAll(
        'input[type="text"], input[type="email"], input[type="tel"], ' +
        'input[type="number"], input[type="url"], input[type="date"], ' +
        'input[type="datetime-local"], input[type="time"], input[type="month"], ' +
        'input[type="week"], input:not([type])'
      );
      return Array.from(inputs)
        .filter((el) => this.isVisible(el) && !el.disabled && !el.readOnly)
        .map((el) => ({
          type: 'text',
          element: el,
          label: this.getLabel(el),
          inputType: el.type || 'text',
          name: el.name || el.id || '',
        }));
    },

    detectTextareas() {
      const textareas = document.querySelectorAll('textarea');
      return Array.from(textareas)
        .filter((el) => this.isVisible(el) && !el.disabled && !el.readOnly)
        .map((el) => ({
          type: 'textarea',
          element: el,
          label: this.getLabel(el),
          name: el.name || el.id || '',
        }));
    },

    detectRadioGroups(processedNames) {
      const radios = document.querySelectorAll('input[type="radio"]');
      const groups = {};

      Array.from(radios)
        .filter((el) => !el.disabled)
        .forEach((el) => {
          const key = el.name || el.dataset.name || 'radio_' + Math.random();
          if (!groups[key]) {
            groups[key] = {
              type: 'radio',
              name: key,
              label: this.getLabel(el),
              options: [],
              elements: [],
            };
          }
          const optionText = this.getOptionLabel(el);
          groups[key].options.push({
            value: el.value,
            text: optionText,
            element: el,
          });
          groups[key].elements.push(el);
        });

      return Object.values(groups).filter((g) => {
        const visible = g.elements.some((el) => this.isVisible(el));
        return visible;
      });
    },

    detectCheckboxGroups(processedNames) {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      const groups = {};
      const standalone = [];

      Array.from(checkboxes)
        .filter((el) => !el.disabled)
        .forEach((el) => {
          const name = el.name || el.dataset.name;
          if (name && name.length > 0) {
            if (!groups[name]) {
              groups[name] = {
                type: 'checkbox-group',
                name: name,
                label: this.getLabel(el),
                options: [],
                elements: [],
              };
            }
            const optionText = this.getOptionLabel(el);
            groups[name].options.push({
              value: el.value,
              text: optionText,
              element: el,
            });
            groups[name].elements.push(el);
          } else {
            standalone.push({
              type: 'checkbox',
              element: el,
              label: this.getLabel(el),
              name: el.id || '',
            });
          }
        });

      const groupList = Object.values(groups).filter((g) => {
        const visible = g.elements.some((el) => this.isVisible(el));
        return visible;
      });

      const standaloneList = standalone.filter((s) => this.isVisible(s.element));

      return [...groupList, ...standaloneList];
    },

    detectSelects() {
      const selects = document.querySelectorAll('select');
      return Array.from(selects)
        .filter((el) => this.isVisible(el) && !el.disabled)
        .map((el) => ({
          type: 'select',
          element: el,
          label: this.getLabel(el),
          name: el.name || el.id || '',
          options: Array.from(el.options).map((opt) => ({
            value: opt.value,
            text: opt.textContent.trim(),
          })),
        }));
    },

    detectRanges() {
      const ranges = document.querySelectorAll('input[type="range"]');
      return Array.from(ranges)
        .filter((el) => this.isVisible(el) && !el.disabled)
        .map((el) => ({
          type: 'range',
          element: el,
          label: this.getLabel(el),
          name: el.name || el.id || '',
          min: parseFloat(el.min) || 0,
          max: parseFloat(el.max) || 100,
        }));
    },

    /**
     * 获取字段的标签文本
     */
    getLabel(el) {
      // 1. 通过 <label for> 查找
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label && label.textContent.trim()) {
          return label.textContent.trim();
        }
      }

      // 2. 通过 aria-label
      if (el.getAttribute('aria-label')) {
        return el.getAttribute('aria-label').trim();
      }

      // 3. 通过 aria-labelledby
      if (el.getAttribute('aria-labelledby')) {
        const labelEl = document.getElementById(el.getAttribute('aria-labelledby'));
        if (labelEl && labelEl.textContent.trim()) {
          return labelEl.textContent.trim();
        }
      }

      // 4. 通过 placeholder
      if (el.placeholder) {
        return el.placeholder.trim();
      }

      // 5. 通过 title
      if (el.title) {
        return el.title.trim();
      }

      // 6. 通过父元素中的 label
      const parentLabel = el.closest('label');
      if (parentLabel && parentLabel.textContent.trim()) {
        return parentLabel.textContent.trim();
      }

      // 7. 通过就近的文本节点（向上查找）
      return this.findNearestText(el);
    },

    /**
     * 获取单选/复选框选项的标签文本
     */
    getOptionLabel(el) {
      // 1. 通过 <label for>
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label && label.textContent.trim()) {
          return label.textContent.trim();
        }
      }

      // 2. 通过父元素 label
      const parentLabel = el.closest('label');
      if (parentLabel && parentLabel.textContent.trim()) {
        return parentLabel.textContent.trim();
      }

      // 3. 通过 aria-label
      if (el.getAttribute('aria-label')) {
        return el.getAttribute('aria-label').trim();
      }

      // 4. 通过 value
      if (el.value && el.value !== 'on') {
        return el.value.trim();
      }

      // 5. 通过就近的文本
      return this.findNearestText(el);
    },

    /**
     * 向上查找最近的文本内容作为标签
     */
    findNearestText(el, maxDepth = 5) {
      let current = el;
      for (let i = 0; i < maxDepth && current; i++) {
        // 检查兄弟节点中的文本
        const sibling = current.previousElementSibling;
        if (sibling && sibling.textContent.trim()) {
          const text = sibling.textContent.trim();
          if (text.length < 200) return text;
        }

        // 检查父元素中的直接文本
        current = current.parentElement;
        if (!current) break;

        // 查找父元素内的标题/标签类元素
        const heading = current.querySelector('label, .label, .title, .question-title, ' +
          '.field-label, .topic-title, [role="heading"], legend');
        if (heading && heading.textContent.trim()) {
          return heading.textContent.trim();
        }
      }
      return '';
    },

    // 可见性缓存（单次检测会话内有效）
    _visibilityCache: null,

    isVisible(el) {
      if (!el || !el.getBoundingClientRect) return false;

      // 使用缓存提升性能（大量字段检测时）
      if (!this._visibilityCache) this._visibilityCache = new WeakMap();
      if (this._visibilityCache.has(el)) return this._visibilityCache.get(el);

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        this._visibilityCache.set(el, false);
        return false;
      }
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        this._visibilityCache.set(el, false);
        return false;
      }
      if (parseFloat(style.opacity) === 0) {
        this._visibilityCache.set(el, false);
        return false;
      }
      // 检查祖先元素是否被隐藏（处理联动字段容器 display:none 的情况）
      let parent = el.parentElement;
      let depth = 0;
      while (parent && depth < 10) {
        const pStyle = window.getComputedStyle(parent);
        if (pStyle.display === 'none' || pStyle.visibility === 'hidden') {
          this._visibilityCache.set(el, false);
          return false;
        }
        parent = parent.parentElement;
        depth++;
      }
      this._visibilityCache.set(el, true);
      return true;
    },

    /**
     * 清除可见性缓存（每次 detectAll 前调用）
     */
    clearCache() {
      this._visibilityCache = null;
    },

    /**
     * 检测所有必填但未填写的字段
     */
    detectRequiredEmpty() {
      const emptyRequired = [];
      const allFields = this.detectAll();
      for (const field of allFields) {
        if (this.isRequired(field) && !this.hasValue(field)) {
          emptyRequired.push({
            type: field.type,
            label: field.label || '(无标签)',
            name: field.name || '',
          });
        }
      }
      return emptyRequired;
    },

    /**
     * 判断字段是否为必填
     */
    isRequired(field) {
      if (field.type === 'radio' || field.type === 'checkbox-group') {
        // 通过标签中的 * 号判断必填
        if (field.label && field.label.includes('*')) return true;
        // 通过第一个元素判断
        const firstEl = field.elements?.[0];
        if (firstEl) {
          const wrapper = firstEl.closest('.question, .field, [role="listitem"], .form-group');
          if (wrapper) {
            const text = wrapper.textContent;
            if (text && text.includes('*')) return true;
          }
        }
        return false;
      }
      const el = field.element;
      if (!el) return false;
      if (el.required) return true;
      if (el.getAttribute('aria-required') === 'true') return true;
      // 通过标签中的 * 号判断
      if (field.label && field.label.includes('*')) return true;
      // 向上查找包含 * 号的容器
      const wrapper = el.closest('.question, .field, [role="listitem"], .form-group');
      if (wrapper) {
        const titleEl = wrapper.querySelector('.question-title, .field-label, label, [role="heading"]');
        if (titleEl && titleEl.textContent.includes('*')) return true;
      }
      return false;
    },

    /**
     * 检查字段是否已有值
     */
    hasValue(field) {
      switch (field.type) {
        case 'text':
        case 'textarea':
          return field.element.value && field.element.value.trim() !== '';
        case 'radio':
          return field.elements?.some((el) => el.checked);
        case 'checkbox-group':
          return field.options?.some((o) => o.element.checked);
        case 'checkbox':
          return field.element.checked;
        case 'select':
          return field.element.selectedIndex > 0;
        case 'range':
          return true;
        case 'star':
          return field.selectedValue !== null && field.selectedValue !== undefined;
        case 'matrix':
          return field.rows?.every((row) => row.selected !== null);
        default:
          return false;
      }
    },

    /**
     * 检测星级评分题
     */
    detectStars() {
      const stars = [];
      // 常见星级评分结构
      const starContainers = document.querySelectorAll(
        '[data-star], .star-rating, .rate-field, .rating, ' +
        '[class*="star"], [class*="rating"]'
      );
      starContainers.forEach((container) => {
        if (!this.isVisible(container)) return;
        const items = container.querySelectorAll('[data-value], .star-item, i, span, [role="radio"]');
        if (items.length >= 3 && items.length <= 10) {
          const label = this.getLabel(container) || this.findNearestText(container);
          stars.push({
            type: 'star',
            element: container,
            label: label,
            name: container.dataset.name || container.id || '',
            max: items.length,
            items: Array.from(items),
          });
        }
      });
      return stars;
    },

    /**
     * 检测矩阵/量表题
     */
    detectMatrix() {
      const matrices = [];
      // 矩阵题通常有行和列的结构
      const matrixTables = document.querySelectorAll(
        'table.matrix, .matrix-table, .scale-table, [class*="matrix"], [class*="scale"]'
      );
      matrixTables.forEach((table) => {
        if (!this.isVisible(table)) return;
        const rows = table.querySelectorAll('tr, .matrix-row, [class*="row"]');
        if (rows.length < 2) return;
        const matrixRows = [];
        rows.forEach((row) => {
          const radios = row.querySelectorAll('input[type="radio"]');
          if (radios.length >= 2) {
            const rowLabel = row.querySelector('td:first-child, th:first-child, .row-label');
            matrixRows.push({
              label: rowLabel ? rowLabel.textContent.trim() : '',
              radios: Array.from(radios),
              selected: null,
            });
          }
        });
        if (matrixRows.length > 0) {
          matrices.push({
            type: 'matrix',
            element: table,
            label: this.getLabel(table) || this.findNearestText(table),
            name: table.dataset.name || table.id || '',
            rows: matrixRows,
          });
        }
      });
      return matrices;
    },

    /**
     * 检测文件上传输入（跳过）
     */
    detectFileUploads() {
      const files = document.querySelectorAll('input[type="file"]');
      return Array.from(files)
        .filter((el) => this.isVisible(el) && !el.disabled)
        .map((el) => ({
          type: 'file',
          element: el,
          label: this.getLabel(el),
          name: el.name || el.id || '',
        }));
    },
  };

  // ==================== 答案解析器 ====================
  const AnswerResolver = {
    /**
     * 根据字段标签和用户配置解析答案
     */
    resolve(field, profile, mode) {
      if (mode === 'random') {
        return this.resolveRandom(field);
      }
      return this.resolveProfile(field, profile);
    },

    resolveProfile(field, profile) {
      const label = (field.label || '').toLowerCase();
      const p = { ...DEFAULT_PROFILE, ...profile };

      // 文本类字段
      if (field.type === 'text' || field.type === 'textarea') {
        return this.matchTextAnswer(label, p, field);
      }

      // 单选按钮
      if (field.type === 'radio') {
        return this.matchRadioAnswer(field, p);
      }

      // 复选框
      if (field.type === 'checkbox-group') {
        return this.matchCheckboxAnswer(field, p);
      }

      if (field.type === 'checkbox') {
        return true; // 默认勾选独立的复选框
      }

      // 下拉选择
      if (field.type === 'select') {
        return this.matchSelectAnswer(field, p);
      }

      // 范围滑块
      if (field.type === 'range') {
        return Math.round((field.min + field.max) / 2);
      }

      // 星级评分题 → 选较高分（4星或70%分位）
      if (field.type === 'star') {
        return Math.max(3, Math.ceil(field.max * 0.7));
      }

      // 矩阵/量表题 → 选中间偏后的列
      if (field.type === 'matrix') {
        const firstRow = field.rows[0];
        if (firstRow) {
          return Math.floor(firstRow.radios.length * 0.6);
        }
        return 0;
      }

      return null;
    },

    matchTextAnswer(label, p, field) {
      const l = label.toLowerCase();

      // 姓名匹配
      if (this.matchAny(l, ['姓名', '名字', 'name', '您的姓名', '全名', '真实姓名'])) {
        return p.name;
      }

      // 手机号
      if (this.matchAny(l, ['手机', '电话', 'tel', 'phone', '联系方式', '手机号', '手机号码'])) {
        return p.phone;
      }

      // 邮箱
      if (this.matchAny(l, ['邮箱', 'email', 'e-mail', '电子邮件', '电子邮箱'])) {
        return p.email;
      }

      // 身份证
      if (this.matchAny(l, ['身份证', 'id', '身份', '证件号', '身份证号', '身份证号码'])) {
        return p.idCard;
      }

      // 年龄
      if (this.matchAny(l, ['年龄', 'age', '岁数', '您的年龄'])) {
        return p.age;
      }

      // 地址
      if (this.matchAny(l, ['地址', 'address', '住址', '家庭住址', '通讯地址', '详细地址'])) {
        return p.address;
      }

      // 学校（优先匹配更精确的"学校名称"等标签，排除含"公司"的复合标签）
      if (this.matchAny(l, ['学校', 'school', '院校', '大学', '毕业院校', '就读学校'])) {
        // 如果标签同时包含"公司"，说明是"公司/学校"复合标签，应按"公司"处理
        if (!this.matchAny(l, ['公司', 'company'])) {
          return p.school;
        }
      }

      // 公司
      if (this.matchAny(l, ['公司', 'company', '单位', '企业', '工作单位', '所在公司', '机构'])) {
        return p.company;
      }

      // 职业
      if (this.matchAny(l, ['职业', 'occupation', 'job', '职位', '工作岗位', '从事'])) {
        return p.occupation;
      }

      // 城市
      if (this.matchAny(l, ['城市', 'city', '所在城市', '居住地', '地区', '省份'])) {
        return p.city;
      }

      // 生日
      if (this.matchAny(l, ['生日', 'birth', '出生', '出生日期', 'birthday'])) {
        return p.birthday;
      }

      // 性别（文本输入时）
      if (this.matchAny(l, ['性别', 'gender', 'sex'])) {
        return p.gender;
      }

      // 收入/薪资
      if (this.matchAny(l, ['收入', '月薪', '年薪', '薪资', '工资', 'salary', 'income', 'earnings'])) {
        return p.income || '10000';
      }

      // 婚姻状况
      if (this.matchAny(l, ['婚姻', '婚否', 'married', 'marital', '婚姻状况'])) {
        return p.marital || '未婚';
      }

      // 民族
      if (this.matchAny(l, ['民族', ' ethnicity', 'nation', 'nationality'])) {
        return p.ethnicity || '汉族';
      }

      // 政治面貌
      if (this.matchAny(l, ['政治', '党派', 'political', 'party', '政治面貌'])) {
        return p.political || '群众';
      }

      // 紧急联系人/亲属
      if (this.matchAny(l, ['紧急联系人', '联系人', '亲属', '家人', 'emergency contact'])) {
        return p.emergencyContact || p.name;
      }

      // 部门/科室
      if (this.matchAny(l, ['部门', '科室', 'department', 'division'])) {
        return p.department || '研发部';
      }

      // 工号/学号
      if (this.matchAny(l, ['工号', '学号', '员工编号', '编号', 'id number', 'staff id'])) {
        return p.staffId || '10001';
      }

      // 建议/意见
      if (this.matchAny(l, ['建议', '意见', '建议意见', 'feedback', 'comment', '备注', '补充', '说明', '其他', 'suggestion'])) {
        return p.suggestions;
      }

      // 扩展匹配：天数
      if (this.matchAny(l, ['天数', '几天', '多少天', 'days', 'duration'])) {
        return '3';
      }

      // 扩展匹配：金额
      if (this.matchAny(l, ['金额', '花费', '预算', '费用', '价格', 'price', 'amount', 'cost'])) {
        return '100';
      }

      // 扩展匹配：体重/身高
      if (this.matchAny(l, ['体重', 'weight'])) {
        return '65';
      }
      if (this.matchAny(l, ['身高', 'height'])) {
        return '175';
      }

      // 扩展匹配：邮编
      if (this.matchAny(l, ['邮编', '邮政编码', 'zip', 'zipcode', 'postal'])) {
        return '100000';
      }

      // 数字类型输入
      if (field.inputType === 'number') {
        return String(Math.floor(Math.random() * 50) + 18);
      }

      // 日期类型
      if (field.inputType === 'date' || field.inputType === 'datetime-local') {
        return p.birthday;
      }

      // 默认：如果是必填项，填入默认建议
      if (field.element && field.element.required) {
        return p.suggestions;
      }

      return null;
    },

    matchRadioAnswer(field, p) {
      const label = (field.label || '').toLowerCase();
      const options = field.options.map(o => ({ ...o, textLower: (o.text || '').toLowerCase() }));

      // 性别
      if (this.matchAny(label, ['性别', 'gender', 'sex'])) {
        const target = p.gender;
        const match = options.find((o) =>
          o.text.includes(target) || target.includes(o.text)
        );
        if (match) return { option: match };
      }

      // 智能选择：满意度/评价类问题 → 选正面答案
      if (this.matchAny(label, ['满意', '满意度', 'satisf', '评价', '评分', 'rate', '感受'])) {
        const positiveKeywords = ['非常满意', '很满意', '满意', '非常同意', '同意', '好', '很好', '非常好', '优秀', 'excellent', 'very satisfied', 'satisfied', 'agree', 'strongly agree'];
        const match = this.findOptionByKeywords(options, positiveKeywords);
        if (match) return { option: match };
      }

      // 智能选择：同意/不同意类问题 → 选同意
      if (this.matchAny(label, ['是否同意', '同意', 'agree', '是否愿意', '意愿'])) {
        const agreeKeywords = ['同意', '非常同意', '完全同意', '愿意', '非常愿意', 'agree', 'yes', 'strongly agree'];
        const match = this.findOptionByKeywords(options, agreeKeywords);
        if (match) return { option: match };
      }

      // 智能选择：频率类问题 → 选"经常"或"有时"
      if (this.matchAny(label, ['频率', '多久', '经常', 'frequency', 'often', 'how often'])) {
        const freqKeywords = ['经常', '有时', '偶尔', '一般', 'often', 'sometimes', 'occasionally'];
        const match = this.findOptionByKeywords(options, freqKeywords);
        if (match) return { option: match };
      }

      // 智能选择：是/否类问题 → 选"是"
      if (this.matchAny(label, ['是否', '有没有', '是否有', '是否已', '是否为', '是否需要'])) {
        const yesKeywords = ['是', '是的', '有', '是的，', '需要', 'yes', 'true'];
        const match = this.findOptionByKeywords(options, yesKeywords);
        if (match) return { option: match };
      }

      // 智能选择：了解程度类 → 选"比较了解"
      if (this.matchAny(label, ['了解', '知道', '熟悉', 'understand', 'know'])) {
        const knowKeywords = ['比较了解', '了解', '知道', '比较熟悉', 'familiar', 'somewhat'];
        const match = this.findOptionByKeywords(options, knowKeywords);
        if (match) return { option: match };
      }

      // 智能选择：重要性类 → 选"重要"
      if (this.matchAny(label, ['重要', '重要性', 'important', 'priority'])) {
        const importantKeywords = ['重要', '比较重要', '非常重要', 'important', 'very important'];
        const match = this.findOptionByKeywords(options, importantKeywords);
        if (match) return { option: match };
      }

      // 智能选择：推荐意愿类 → 选"愿意"
      if (this.matchAny(label, ['推荐', 'nps', '愿意推荐', 'recommend'])) {
        const recommendKeywords = ['非常愿意', '愿意', '很可能', '会推荐', 'very likely', 'likely', 'definitely'];
        const match = this.findOptionByKeywords(options, recommendKeywords);
        if (match) return { option: match };
      }

      // 量表题（1-5 / 1-7 / 1-10）→ 选偏高的值
      if (this.isScaleQuestion(options)) {
        // 选 4/5 分位附近的选项（偏正面但不极端）
        const targetIdx = Math.floor(options.length * 0.7);
        if (options[targetIdx]) return { option: options[targetIdx] };
      }

      // 默认：选择中间偏后的选项（避免极端选项）
      if (options.length > 0) {
        if (options.length <= 2) {
          return { option: options[0] };
        }
        const midIdx = Math.floor(options.length * 0.6);
        return { option: options[midIdx] };
      }
      return null;
    },

    matchCheckboxAnswer(field, p) {
      const label = (field.label || '').toLowerCase();
      const options = field.options.map(o => ({ ...o, textLower: (o.text || '').toLowerCase() }));

      // 智能选择：满意度/评价类 → 选正面选项
      if (this.matchAny(label, ['满意', '满意度', 'satisf', '评价', '优点', '好的方面'])) {
        const positiveKeywords = ['质量好', '服务好', '态度好', '速度快', '方便', '实用', '友好', '专业', '高效', 'good', 'excellent', 'friendly', 'professional'];
        const matched = options.filter(o =>
          positiveKeywords.some(kw => o.textLower.includes(kw))
        );
        if (matched.length > 0) {
          return { options: matched.slice(0, Math.min(3, matched.length)) };
        }
      }

      // 智能选择：使用过/了解哪些 → 选前2-3个
      if (this.matchAny(label, ['哪些', '使用过', '了解', '参加过', '拥有', 'which', 'what'])) {
        const count = Math.min(Math.max(1, Math.floor(options.length / 3)), 3);
        return { options: options.slice(0, count) };
      }

      // 智能选择：需要改进/问题 → 选1个最不极端的
      if (this.matchAny(label, ['改进', '问题', '不足', '不满意', '建议改进', 'problem', 'issue'])) {
        if (options.length > 0) {
          return { options: [options[Math.floor(options.length / 2)]] };
        }
      }

      // 默认：选择前1-2个选项
      if (options.length > 0) {
        const count = Math.min(2, options.length);
        return { options: options.slice(0, count) };
      }
      return null;
    },

    matchSelectAnswer(field, p) {
      const label = (field.label || '').toLowerCase();
      const options = field.options.filter(o => o.value && o.value !== '');
      if (options.length === 0) {
        if (field.options.length > 1) {
          return { value: field.options[1].value, text: field.options[1].text };
        }
        return null;
      }

      // 性别下拉
      if (this.matchAny(label, ['性别', 'gender', 'sex'])) {
        const match = options.find(o =>
          o.text.includes(p.gender) || p.gender.includes(o.text)
        );
        if (match) return { value: match.value, text: match.text };
      }

      // 城市/省份下拉 → 匹配预设城市
      if (this.matchAny(label, ['城市', '省份', '地区', 'city', 'province', 'region'])) {
        const match = options.find(o =>
          o.text.includes(p.city) || p.city.includes(o.text)
        );
        if (match) return { value: match.value, text: match.text };
      }

      // 学历下拉 → 选本科
      if (this.matchAny(label, ['学历', '学位', 'education', 'degree'])) {
        const eduKeywords = ['本科', '大学本科', '学士', 'bachelor'];
        const match = options.find(o =>
          eduKeywords.some(kw => o.text.toLowerCase().includes(kw.toLowerCase()))
        );
        if (match) return { value: match.value, text: match.text };
      }

      // 职业下拉 → 匹配预设职业
      if (this.matchAny(label, ['职业', '行业', 'occupation', 'job', 'industry'])) {
        const match = options.find(o =>
          o.text.includes(p.occupation) || p.occupation.includes(o.text)
        );
        if (match) return { value: match.value, text: match.text };
      }

      // 默认：跳过占位项（"请选择"），选第一个有效选项
      const realOptions = options.filter(o =>
        !this.matchAny(o.text.toLowerCase(), ['请选择', '请填', '选择', 'select', 'choose', '请...', '---'])
      );
      if (realOptions.length > 0) {
        return { value: realOptions[0].value, text: realOptions[0].text };
      }
      return { value: options[0].value, text: options[0].text };
    },

    /**
     * 在选项列表中按关键词查找匹配项
     */
    findOptionByKeywords(options, keywords) {
      // 优先精确匹配
      for (const kw of keywords) {
        const match = options.find(o => o.textLower === kw || o.textLower === kw.toLowerCase());
        if (match) return match;
      }
      // 其次包含匹配
      for (const kw of keywords) {
        const match = options.find(o => o.textLower.includes(kw.toLowerCase()));
        if (match) return match;
      }
      return null;
    },

    /**
     * 判断是否为量表题（选项为纯数字或1-N分制）
     */
    isScaleQuestion(options) {
      if (options.length < 3) return false;
      let numericCount = 0;
      for (const o of options) {
        const text = o.text.trim();
        if (/^\d+$/.test(text) || /^\d+分$/.test(text) || /^[①②③④⑤⑥⑦⑧⑨⑩]$/.test(text)) {
          numericCount++;
        }
      }
      return numericCount >= options.length * 0.6;
    },

    resolveRandom(field) {
      if (field.type === 'text' || field.type === 'textarea') {
        return this.generateRandomText(field);
      }

      if (field.type === 'radio') {
        if (field.options.length > 0) {
          const idx = Math.floor(Math.random() * field.options.length);
          return { option: field.options[idx] };
        }
      }

      if (field.type === 'checkbox-group') {
        if (field.options.length > 0) {
          const count = Math.floor(Math.random() * field.options.length) + 1;
          const shuffled = [...field.options].sort(() => Math.random() - 0.5);
          return { options: shuffled.slice(0, count) };
        }
      }

      if (field.type === 'checkbox') {
        return Math.random() > 0.5;
      }

      if (field.type === 'select') {
        const validOptions = field.options.filter((o) => o.value && o.value !== '');
        if (validOptions.length > 0) {
          const idx = Math.floor(Math.random() * validOptions.length);
          return { value: validOptions[idx].value, text: validOptions[idx].text };
        }
      }

      if (field.type === 'star') {
        return Math.floor(Math.random() * field.max) + 1;
      }

      if (field.type === 'matrix') {
        const firstRow = field.rows[0];
        if (firstRow) {
          return Math.floor(Math.random() * firstRow.radios.length);
        }
        return 0;
      }

      if (field.type === 'range') {
        const min = field.min || 0;
        const max = field.max || 100;
        return Math.round(min + Math.random() * (max - min));
      }

      return null;
    },

    generateRandomText(field) {
      const label = (field.label || '').toLowerCase();
      const inputType = field.inputType || 'text';

      if (inputType === 'email') {
        const names = ['user', 'test', 'info', 'admin', 'contact'];
        const domains = ['example.com', 'test.com', 'mail.com', 'demo.org'];
        return `${names[Math.floor(Math.random() * names.length)]}@${domains[Math.floor(Math.random() * domains.length)]}`;
      }

      if (inputType === 'tel') {
        return '1' + String(Math.floor(Math.random() * 9) + 1) +
          String(Math.floor(Math.random() * 900000000) + 100000000);
      }

      if (inputType === 'number') {
        return String(Math.floor(Math.random() * 50) + 18);
      }

      if (inputType === 'url') {
        return 'https://example.com';
      }

      if (inputType === 'date') {
        const year = 1970 + Math.floor(Math.random() * 30);
        const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
        const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      if (this.matchAny(label, ['姓名', 'name', '名字'])) {
        const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴'];
        const givenNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋'];
        return surnames[Math.floor(Math.random() * surnames.length)] +
          givenNames[Math.floor(Math.random() * givenNames.length)];
      }

      // 默认随机文本
      const texts = ['很好', '满意', '同意', '不错', '可以', '无', '良好', '正常'];
      return texts[Math.floor(Math.random() * texts.length)];
    },

    matchAny(text, keywords) {
      return keywords.some((kw) => text.includes(kw.toLowerCase()));
    },
  };

  // ==================== 表单填写器 ====================
  const FormFiller = {
    filledCount: 0,
    totalCount: 0,
    fillDelay: 50,
    filledElements: new Set(), // 已填写的元素集合（避免重复填写联动字段）

    /**
     * 填写所有检测到的字段（跳过已填写的）
     */
    async fillAll(profile, mode) {
      const fields = FieldDetector.detectAll();
      const newFields = fields.filter(f => !this.isAlreadyFilled(f));
      this.totalCount = fields.length;

      for (const field of newFields) {
        await this.fillField(field, profile, mode);
        this.filledCount++;
        this.markFilled(field);
        if (this.fillDelay > 0) {
          await this.sleep(this.fillDelay);
        }
      }

      return { filled: this.filledCount, total: this.totalCount, newFields: newFields.length };
    },

    /**
     * 重置填写状态
     */
    resetState() {
      this.filledCount = 0;
      this.totalCount = 0;
      this.filledElements = new Set();
      this.removeHighlights();
    },

    /**
     * 判断字段是否已填写过
     */
    isAlreadyFilled(field) {
      if (field.type === 'radio' || field.type === 'checkbox-group') {
        // 单选/多选组：检查是否有选项已被标记
        return field.elements?.some(el => this.filledElements.has(el)) ||
               field.options?.some(o => this.filledElements.has(o.element));
      }
      return this.filledElements.has(field.element);
    },

    /**
     * 标记字段为已填写
     */
    markFilled(field) {
      if (field.type === 'radio' || field.type === 'checkbox-group') {
        field.elements?.forEach(el => this.filledElements.add(el));
        field.options?.forEach(o => this.filledElements.add(o.element));
      } else {
        this.filledElements.add(field.element);
      }
    },

    /**
     * 检查字段是否已经有值（用户手动填的或之前填的）
     */
    hasValue(field) {
      switch (field.type) {
        case 'text':
        case 'textarea':
          return field.element.value && field.element.value.trim() !== '';
        case 'radio':
          return field.elements?.some(el => el.checked);
        case 'checkbox-group':
          return field.options?.some(o => o.element.checked);
        case 'checkbox':
          return field.element.checked;
        case 'select':
          return field.element.selectedIndex > 0;
        case 'range':
          return true; // 滑块总有值
        default:
          return false;
      }
    },

    async fillField(field, profile, mode) {
      // 跳过已经有值的字段（避免覆盖联动逻辑已设置的值）
      if (FieldDetector.hasValue(field)) {
        return false;
      }

      const answer = AnswerResolver.resolve(field, profile, mode);
      if (answer === null || answer === undefined) return false;

      try {
        switch (field.type) {
          case 'text':
            this.fillText(field.element, answer);
            break;
          case 'textarea':
            this.fillText(field.element, answer);
            break;
          case 'radio':
            if (answer.option) {
              this.clickRadio(answer.option.element);
              // 填写后额外等待，给联动字段时间出现
              await this.sleep(200);
            }
            break;
          case 'checkbox-group':
            if (answer.options) {
              answer.options.forEach((opt) => this.clickCheckbox(opt.element));
              await this.sleep(200);
            }
            break;
          case 'checkbox':
            this.clickCheckbox(field.element);
            await this.sleep(200);
            break;
          case 'select':
            if (answer.value !== undefined) {
              this.fillSelect(field.element, answer.value, answer.text);
              await this.sleep(200);
            }
            break;
          case 'range':
            this.fillRange(field.element, answer);
            break;
          case 'star':
            if (answer !== null) {
              this.fillStar(field, answer);
              await this.sleep(200);
            }
            break;
          case 'matrix':
            if (answer !== null) {
              this.fillMatrix(field, answer);
              await this.sleep(200);
            }
            break;
          case 'file':
            // 文件上传暂不支持自动填写
            break;
        }
        this.highlight(field.element, true);
        return true;
      } catch (e) {
        console.warn('[问卷助手] 填写失败:', field, e);
        return false;
      }
    },

    /**
     * 设置文本值（兼容 React/Vue 等框架）
     */
    setNativeValue(el, value) {
      // 获取原生 setter，绕过 React 的值拦截
      const proto = el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, value);
      } else {
        el.value = value;
      }
    },

    fillText(el, value) {
      this.setNativeValue(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    },

    clickRadio(el) {
      // 某些平台用自定义元素，需要点击父元素
      const customWrapper = el.closest('[role="radio"], [data-radio], .radio-wrapper, label');
      if (customWrapper && customWrapper !== el) {
        customWrapper.click();
      } else {
        el.click();
      }
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    },

    clickCheckbox(el) {
      if (!el.checked) {
        const customWrapper = el.closest('[role="checkbox"], [data-checkbox], .checkbox-wrapper, label');
        if (customWrapper && customWrapper !== el) {
          customWrapper.click();
        } else {
          el.click();
        }
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    },

    fillSelect(el, value, textHint) {
      // select 元素需要直接设置 selectedIndex
      // 优先按 value 匹配，其次按 text 匹配
      let matchedIndex = -1;
      for (let i = 0; i < el.options.length; i++) {
        if (el.options[i].value === value) {
          matchedIndex = i;
          break;
        }
      }
      // 如果 value 没匹配到，尝试按 textHint 匹配
      if (matchedIndex === -1 && textHint) {
        const hint = String(textHint).toLowerCase();
        for (let i = 0; i < el.options.length; i++) {
          const optText = el.options[i].textContent.trim().toLowerCase();
          if (optText === hint || optText.includes(hint)) {
            matchedIndex = i;
            break;
          }
        }
      }
      // 如果还没匹配到，尝试 value 作为 text 匹配
      if (matchedIndex === -1) {
        const valStr = String(value).toLowerCase();
        for (let i = 0; i < el.options.length; i++) {
          const optText = el.options[i].textContent.trim().toLowerCase();
          if (optText === valStr || optText.includes(valStr)) {
            matchedIndex = i;
            break;
          }
        }
      }
      if (matchedIndex >= 0) {
        el.selectedIndex = matchedIndex;
        el.options[matchedIndex].selected = true;
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },

    fillRange(el, value) {
      this.setNativeValue(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },

    fillStar(field, rating) {
      // rating 为 1-based 的星级，选择对应索引的 item
      const idx = Math.min(Math.max(0, rating - 1), field.items.length - 1);
      const item = field.items[idx];
      if (item) {
        item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
        item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        item.click();
        item.dispatchEvent(new Event('click', { bubbles: true }));
        item.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },

    fillMatrix(field, answer) {
      // answer 是每行选择的索引或值
      if (typeof answer === 'number' || typeof answer === 'string') {
        // 统一选择某一列
        const colIdx = parseInt(answer, 10);
        field.rows.forEach((row) => {
          const radio = row.radios[colIdx];
          if (radio) {
            radio.click();
            radio.dispatchEvent(new Event('click', { bubbles: true }));
            radio.dispatchEvent(new Event('input', { bubbles: true }));
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      } else if (Array.isArray(answer)) {
        // 每行选择不同列
        field.rows.forEach((row, idx) => {
          const colIdx = answer[idx] !== undefined ? answer[idx] : Math.floor(row.radios.length / 2);
          const radio = row.radios[colIdx];
          if (radio) {
            radio.click();
            radio.dispatchEvent(new Event('click', { bubbles: true }));
            radio.dispatchEvent(new Event('input', { bubbles: true }));
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
    },

    highlight(el, filled) {
      if (!el) return;
      // 找到可见的父元素（因为单选/复选框本身可能很小）
      let target = el;
      if (el.type === 'radio' || el.type === 'checkbox') {
        const wrapper = el.closest('label, .option, .radio-item, .checkbox-item, [role="radio"], [role="checkbox"]');
        if (wrapper) target = wrapper;
      }
      target.classList.add(filled ? HIGHLIGHT_FILLED_CLASS : HIGHLIGHT_CLASS);
    },

    removeHighlights() {
      document.querySelectorAll(`.${HIGHLIGHT_CLASS}, .${HIGHLIGHT_FILLED_CLASS}`).forEach((el) => {
        el.classList.remove(HIGHLIGHT_CLASS, HIGHLIGHT_FILLED_CLASS);
      });
    },

    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
  };

  // ==================== 状态面板 ====================
  const StatusPanel = {
    panel: null,

    show(message, type = 'info') {
      this.remove();
      const panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.className = `qaf-panel qaf-panel-${type}`;
      panel.innerHTML = `
        <div class="qaf-panel-content">
          <span class="qaf-panel-icon">${this.getIcon(type)}</span>
          <span class="qaf-panel-text">${message}</span>
        </div>
      `;
      document.body.appendChild(panel);
      this.panel = panel;

      // 触发动画
      requestAnimationFrame(() => panel.classList.add('qaf-panel-show'));
    },

    update(message, type = 'info') {
      if (this.panel) {
        const textEl = this.panel.querySelector('.qaf-panel-text');
        if (textEl) textEl.textContent = message;
      } else {
        this.show(message, type);
      }
    },

    hide(delay = 2000) {
      setTimeout(() => {
        if (this.panel) {
          this.panel.classList.remove('qaf-panel-show');
          setTimeout(() => this.remove(), 300);
        }
      }, delay);
    },

    remove() {
      const existing = document.getElementById(PANEL_ID);
      if (existing) existing.remove();
      this.panel = null;
    },

    getIcon(type) {
      const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        loading: '⏳',
        error: '❌',
      };
      return icons[type] || icons.info;
    },
  };

  // ==================== Google Forms 适配器 ====================
  const GoogleFormsAdapter = {
    isGoogleForms() {
      return location.hostname.includes('docs.google.com') &&
             location.pathname.includes('/forms/');
    },

    /**
     * 为 Google Forms 执行特殊的填写逻辑
     */
    async fill(profile, mode) {
      // Google Forms 使用自定义的 div 结构而非原生 input
      const questions = document.querySelectorAll('[role="listitem"], [jsname="RSG6Bb"]');

      for (const question of questions) {
        await this.fillQuestion(question, profile, mode);
        await FormFiller.sleep(100);
      }
    },

    async fillQuestion(questionEl, profile, mode) {
      // 获取问题文本
      const titleEl = questionEl.querySelector('[role="heading"], .M7eMe, .HoXoMd');
      const questionText = titleEl ? titleEl.textContent.trim().toLowerCase() : '';

      // 检测选项类型
      const textInput = questionEl.querySelector('input[type="text"], input[type="email"], input[type="tel"], textarea');
      const radios = questionEl.querySelectorAll('[role="radio"], [data-value]');
      const checkboxes = questionEl.querySelectorAll('[role="checkbox"]');

      if (textInput) {
        const answer = AnswerResolver.resolve({ type: 'text', label: questionText, inputType: textInput.type }, profile, mode);
        if (answer !== null) {
          FormFiller.fillText(textInput, answer);
          FormFiller.highlight(textInput, true);
        }
      } else if (radios.length > 0) {
        const idx = mode === 'random'
          ? Math.floor(Math.random() * radios.length)
          : 0;
        if (radios[idx]) {
          radios[idx].click();
          FormFiller.highlight(radios[idx], true);
        }
      } else if (checkboxes.length > 0) {
        if (mode === 'random') {
          const count = Math.floor(Math.random() * checkboxes.length) + 1;
          for (let i = 0; i < count && i < checkboxes.length; i++) {
            checkboxes[i].click();
            FormFiller.highlight(checkboxes[i], true);
          }
        } else {
          if (checkboxes[0]) {
            checkboxes[0].click();
            FormFiller.highlight(checkboxes[0], true);
          }
        }
      }
    },
  };

  // ==================== 问卷星适配器 ====================
  const WenjuanxingAdapter = {
    isWenjuanxing() {
      return location.hostname.includes('wjx.cn') || location.hostname.includes('wjx.top');
    },

    async fill(profile, mode) {
      const questions = document.querySelectorAll('.div_question, .field');

      for (const q of questions) {
        await this.fillQuestion(q, profile, mode);
        await FormFiller.sleep(80);
      }
    },

    async fillQuestion(qEl, profile, mode) {
      const titleEl = qEl.querySelector('.topichtml, .field-label, .q-title');
      const questionText = titleEl ? titleEl.textContent.trim().toLowerCase() : '';

      // 问卷星的单选/多选使用特殊的 ul/li 结构
      const radios = qEl.querySelectorAll('.ui-radio, input[type="radio"]');
      const checkboxes = qEl.querySelectorAll('.ui-checkbox, input[type="checkbox"]');
      const textInput = qEl.querySelector('input[type="text"], textarea, .inputtext');

      if (textInput) {
        const answer = AnswerResolver.resolve({ type: 'text', label: questionText, inputType: textInput.type || 'text' }, profile, mode);
        if (answer !== null) {
          FormFiller.fillText(textInput, answer);
          FormFiller.highlight(textInput, true);
        }
      } else if (radios.length > 0) {
        const idx = mode === 'random' ? Math.floor(Math.random() * radios.length) : 0;
        const radio = radios[idx];
        if (radio) {
          if (radio.tagName === 'INPUT') {
            FormFiller.clickRadio(radio);
          } else {
            radio.click();
          }
          FormFiller.highlight(radio, true);
        }
      } else if (checkboxes.length > 0) {
        if (mode === 'random') {
          const count = Math.floor(Math.random() * checkboxes.length) + 1;
          for (let i = 0; i < count && i < checkboxes.length; i++) {
            const cb = checkboxes[i];
            if (cb.tagName === 'INPUT') {
              FormFiller.clickCheckbox(cb);
            } else {
              cb.click();
            }
            FormFiller.highlight(cb, true);
          }
        } else {
          const cb = checkboxes[0];
          if (cb) {
            if (cb.tagName === 'INPUT') {
              FormFiller.clickCheckbox(cb);
            } else {
              cb.click();
            }
            FormFiller.highlight(cb, true);
          }
        }
      }
    },
  };

  // ==================== 自动检测器 ====================
  const AutoDetector = {
    autoFillEnabled: false,
    autoFillDelay: 1500,
    hasAutoFilled: false,

    async init() {
      const data = await chrome.storage.local.get(['settings']);
      const settings = data.settings || {};
      this.autoFillEnabled = settings.autoFill === true;
      this.autoFillDelay = settings.autoFillDelay || 1500;

      if (this.autoFillEnabled) {
        // 延迟检测，等待页面完全加载
        setTimeout(() => this.checkAndAutoFill(), this.autoFillDelay);
      }
    },

    /**
     * 检测当前页面是否像问卷，如果是则自动填写
     */
    async checkAndAutoFill() {
      if (this.hasAutoFilled) return;

      const fields = FieldDetector.detectAll();
      if (fields.length < 3) return; // 字段太少，可能不是问卷

      // 判断是否像问卷页面
      if (!this.looksLikeQuestionnaire(fields)) return;

      this.hasAutoFilled = true;

      // 获取用户配置
      const data = await chrome.storage.local.get(['profiles', 'settings', 'activeProfile']);
      const profiles = data.profiles || [DEFAULT_PROFILE];
      const activeName = data.activeProfile || profiles[0]?.name;
      const profile = profiles.find((p) => p.name === activeName) || profiles[0] || DEFAULT_PROFILE;
      const mode = (data.settings || {}).mode || 'profile';

      StatusPanel.show('检测到问卷，自动填写中...', 'loading');
      await FormFiller.sleep(500);

      await Controller.handleFillAll({ profile, mode, silent: true });
    },

    /**
     * 判断页面是否像问卷
     */
    looksLikeQuestionnaire(fields) {
      const platform = PlatformDetector.detect();
      if (platform !== 'generic') return true;

      // 通用页面：需要较多表单字段才判定为问卷
      const radioCount = fields.filter(f => f.type === 'radio').length;
      const checkboxCount = fields.filter(f => f.type === 'checkbox-group' || f.type === 'checkbox').length;
      const textCount = fields.filter(f => f.type === 'text' || f.type === 'textarea').length;

      // 有3个以上单选/多选组，或总共5个以上字段
      return (radioCount + checkboxCount >= 3) || fields.length >= 5;
    },
  };

  // ==================== 主控制器 ====================
  const Controller = {
    async execute(action, data) {
      switch (action) {
        case 'fillAll':
          return await this.handleFillAll(data);
        case 'detectFields':
          return this.handleDetectFields();
        case 'clearHighlights':
          FormFiller.removeHighlights();
          return { success: true };
        case 'getPlatform':
          return PlatformDetector.getInfo();
        case 'setAutoFill':
          AutoDetector.autoFillEnabled = !!data.enabled;
          if (data.enabled && !AutoDetector.hasAutoFilled) {
            AutoDetector.checkAndAutoFill();
          }
          return { success: true, autoFill: AutoDetector.autoFillEnabled };
        default:
          return { error: '未知操作' };
      }
    },

    async handleFillAll(data) {
      const profile = data.profile || DEFAULT_PROFILE;
      const mode = data.mode || 'profile';
      const silent = data.silent || false;
      const maxRounds = 5; // 最多循环5轮，防止无限循环
      const roundWaitDelay = 600; // 每轮之间等待新字段出现的延迟(ms)

      if (!silent) {
        StatusPanel.show('正在检测问卷字段...', 'loading');
      }

      const platformInfo = PlatformDetector.getInfo();
      FormFiller.resetState();
      let totalFilled = 0;
      let totalFields = 0;

      // 平台特定处理（第一轮）
      if (GoogleFormsAdapter.isGoogleForms()) {
        if (!silent) StatusPanel.update('正在填写 Google Forms...', 'loading');
        await GoogleFormsAdapter.fill(profile, mode);
      } else if (WenjuanxingAdapter.isWenjuanxing()) {
        if (!silent) StatusPanel.update('正在填写问卷星...', 'loading');
        await WenjuanxingAdapter.fill(profile, mode);
      }

      // 多轮循环填写（处理条件联动字段）
      for (let round = 1; round <= maxRounds; round++) {
        if (!silent) {
          StatusPanel.update(
            round === 1
              ? `正在填写${platformInfo.name}问卷...`
              : `检测到联动字段，第 ${round} 轮填写中...`,
            'loading'
          );
        }

        const result = await FormFiller.fillAll(profile, mode);
        totalFilled = result.filled;
        totalFields = result.total;

        // 如果本轮没有新字段需要填写，说明没有联动字段了
        if (result.newFields === 0) {
          break;
        }

        // 如果不是最后一轮，等待新字段出现
        if (round < maxRounds) {
          if (!silent) {
            StatusPanel.update(`等待联动字段加载... (${totalFilled}/${totalFields} 已填)`, 'loading');
          }
          await FormFiller.sleep(roundWaitDelay);
        }
      }

      // 必填项验证
      const emptyRequired = FieldDetector.detectRequiredEmpty();

      if (!silent) {
        if (emptyRequired.length > 0) {
          StatusPanel.update(
            `填写完成 ${totalFilled}/${totalFields} 个字段，${emptyRequired.length} 个必填项未填`,
            'warning'
          );
        } else {
          StatusPanel.update(
            `填写完成！共填写 ${totalFilled}/${totalFields} 个字段`,
            'success'
          );
        }
        StatusPanel.hide(4000);
      }

      return {
        success: true,
        filled: totalFilled,
        total: totalFields,
        platform: platformInfo.name,
        emptyRequired: emptyRequired.length > 0 ? emptyRequired : undefined,
      };
    },

    handleDetectFields() {
      const fields = FieldDetector.detectAll();
      const platformInfo = PlatformDetector.getInfo();
      const requiredCount = fields.filter((f) => FieldDetector.isRequired(f)).length;
      return {
        success: true,
        count: fields.length,
        requiredCount: requiredCount,
        platform: platformInfo.name,
        fields: fields.map((f) => ({
          type: f.type,
          label: f.label || '(无标签)',
          name: f.name || '',
          required: FieldDetector.isRequired(f),
          options: f.options ? f.options.map((o) => o.text || o.value) : undefined,
        })),
      };
    },
  };

  // ==================== 消息监听 ====================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    Controller.execute(request.action, request.data || {})
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('[问卷助手] 执行出错:', error);
        StatusPanel.show('执行出错: ' + error.message, 'error');
        StatusPanel.hide(3000);
        sendResponse({ error: error.message });
      });
    return true; // 保持消息通道打开
  });

  // ==================== 初始化 ====================
  console.log('[问卷自动填写助手] 内容脚本已加载，平台:', PlatformDetector.getInfo().name);
  AutoDetector.init();
})();
