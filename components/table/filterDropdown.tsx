import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Menu, { SubMenu, Item as MenuItem } from 'rc-menu';
import closest from 'dom-closest';
import classNames from 'classnames';
import shallowequal from 'shallowequal';
import Dropdown from '../dropdown';
import Icon from '../icon';
import Checkbox from '../checkbox';
import Radio from '../radio';
import FilterDropdownMenuWrapper from './FilterDropdownMenuWrapper';
import { FilterMenuProps, FilterMenuState, ColumnProps, ColumnFilterItem } from './interface';

function stopPropagation(e: React.SyntheticEvent<any>) {
  e.stopPropagation();
  if (e.nativeEvent.stopImmediatePropagation) {
    e.nativeEvent.stopImmediatePropagation();
  }
}

export default class FilterMenu<T> extends React.Component<FilterMenuProps<T>, FilterMenuState> {
  static defaultProps = {
    handleFilter() {},
    column: {},
  };

  neverShown: boolean;

  constructor(props: FilterMenuProps<T>) {
    super(props);

    const visible = ('filterDropdownVisible' in props.column) ?
      props.column.filterDropdownVisible : false;

    this.state = {
      selectedKeys: props.selectedKeys,
      keyPathOfSelectedItem: {},    // 记录所有有选中子菜单的祖先菜单
      visible,
    };
  }

  componentDidMount() {
    const { column } = this.props;
    this.setNeverShown(column);
  }

  componentWillReceiveProps(nextProps: FilterMenuProps<T>) {
    const { column } = nextProps;
    this.setNeverShown(column);
    const newState = {} as {
      selectedKeys: string[];
      visible: boolean;
    };

    /**
     * if the state is visible the component should ignore updates on selectedKeys prop to avoid
     * that the user selection is lost
     * this happens frequently when a table is connected on some sort of realtime data
     * Fixes https://github.com/ant-design/ant-design/issues/10289 and
     * https://github.com/ant-design/ant-design/issues/10209
     */
    if ('selectedKeys' in nextProps && !shallowequal(this.props.selectedKeys, nextProps.selectedKeys)) {
      newState.selectedKeys = nextProps.selectedKeys;
    }
    if ('filterDropdownVisible' in column) {
      newState.visible = column.filterDropdownVisible as boolean;
    }
    if (Object.keys(newState).length > 0) {
      this.setState(newState);
    }
  }

  getDropdownVisible() {
    return this.neverShown ? false : this.state.visible;
  }

  setNeverShown = (column: ColumnProps<T>) => {
    const rootNode = ReactDOM.findDOMNode(this);
    const filterBelongToScrollBody = !!closest(rootNode, `.ant-table-scroll`);
    if (filterBelongToScrollBody) {
      // When fixed column have filters, there will be two dropdown menus
      // Filter dropdown menu inside scroll body should never be shown
      // To fix https://github.com/ant-design/ant-design/issues/5010 and
      // https://github.com/ant-design/ant-design/issues/7909
      this.neverShown = !!column.fixed;
    }
  }

  setSelectedKeys = ({ selectedKeys }: { selectedKeys: string[] }) => {
    this.setState({ selectedKeys });
  }

  setVisible(visible: boolean) {
    const { column } = this.props;
    if (!('filterDropdownVisible' in column)) {
      this.setState({ visible });
    }
    if (column.onFilterDropdownVisibleChange) {
      column.onFilterDropdownVisibleChange(visible);
    }
  }

  handleClearFilters = () => {
    this.setState({
      selectedKeys: [],
    }, this.handleConfirm);
  }

  handleConfirm = () => {
    this.setVisible(false);

    // Call `setSelectedKeys` & `confirm` in the same time will make filter data not up to date
    // https://github.com/ant-design/ant-design/issues/12284
    this.setState({}, this.confirmFilter);
  }

  onVisibleChange = (visible: boolean) => {
    this.setVisible(visible);
    if (!visible) {
      this.confirmFilter();
    }
  }

  confirmFilter() {
    const { selectedKeys } = this.state;

    if (!shallowequal(selectedKeys, this.props.selectedKeys)) {
      this.props.confirmFilter(this.props.column, selectedKeys);
    }
  }

  renderMenuItem(item: ColumnFilterItem) {
    const { column } = this.props;
    const { selectedKeys } = this.state;
    const multiple = ('filterMultiple' in column) ? column.filterMultiple : true;
    const input = multiple
      ? <Checkbox checked={selectedKeys && selectedKeys.indexOf(item.value.toString()) >= 0} />
      : <Radio checked={selectedKeys && selectedKeys.indexOf(item.value.toString()) >= 0} />;

    return (
      <MenuItem key={item.value}>
        {input}
        <span>{item.text}</span>
      </MenuItem>
    );
  }

  hasSubMenu() {
    const { column: { filters = [] } } = this.props;
    return filters.some(item => !!(item.children && item.children.length > 0));
  }

  renderMenus(items: ColumnFilterItem[]): React.ReactElement<any>[] {
    return items.map(item => {
      if (item.children && item.children.length > 0) {
        const { keyPathOfSelectedItem } = this.state;
        const containSelected = Object.keys(keyPathOfSelectedItem).some(
          key => keyPathOfSelectedItem[key].indexOf(item.value) >= 0,
        );
        const subMenuCls = containSelected ? `${this.props.dropdownPrefixCls}-submenu-contain-selected` : '';
        return (
          <SubMenu title={item.text} className={subMenuCls} key={item.value.toString()}>
            {this.renderMenus(item.children)}
          </SubMenu>
        );
      }
      return this.renderMenuItem(item);
    });
  }

  handleMenuItemClick = (info: { keyPath: string, key: string }) => {
    const { selectedKeys } = this.state;
    if (!info.keyPath || info.keyPath.length <= 1) {
      return;
    }
    const keyPathOfSelectedItem = this.state.keyPathOfSelectedItem;
    if (selectedKeys && selectedKeys.indexOf(info.key) >= 0) {
      // deselect SubMenu child
      delete keyPathOfSelectedItem[info.key];
    } else {
      // select SubMenu child
      keyPathOfSelectedItem[info.key] = info.keyPath;
    }
    this.setState({ keyPathOfSelectedItem });
  }

  renderFilterIcon = () => {
    const { column, locale, prefixCls, selectedKeys } = this.props;
    const filtered = selectedKeys && selectedKeys.length > 0;
    let filterIcon = column.filterIcon as any;
    if (typeof filterIcon === 'function') {
      filterIcon = filterIcon(filtered);
    }

    const dropdownIconClass = classNames({
      [`${prefixCls}-selected`]: filtered,
      [`${prefixCls}-open`]: this.getDropdownVisible(),
    });

    return filterIcon ? React.cloneElement(filterIcon as any, {
      title: locale.filterTitle,
      className: classNames(`${prefixCls}-icon`, dropdownIconClass, filterIcon.props.className),
      onClick: stopPropagation,
    }) : (
      <Icon
        title={locale.filterTitle}
        type="filter"
        theme="filled"
        className={dropdownIconClass}
        onClick={stopPropagation}
      />
    );
  }

  render() {
    const { column, locale, prefixCls, dropdownPrefixCls, getPopupContainer } = this.props;
    // default multiple selection in filter dropdown
    const multiple = ('filterMultiple' in column) ? column.filterMultiple : true;
    const dropdownMenuClass = classNames({
      [`${dropdownPrefixCls}-menu-without-submenu`]: !this.hasSubMenu(),
    });
    let { filterDropdown } = column;
    if (filterDropdown instanceof Function) {
      filterDropdown = filterDropdown({
        prefixCls: `${dropdownPrefixCls}-custom`,
        setSelectedKeys: (selectedKeys: Array<any>) => this.setSelectedKeys({ selectedKeys }),
        selectedKeys: this.state.selectedKeys,
        confirm: this.handleConfirm,
        clearFilters: this.handleClearFilters,
        filters: column.filters,
        getPopupContainer: (triggerNode: HTMLElement) => triggerNode.parentNode,
      });
    }

    const menus = filterDropdown ? (
      <FilterDropdownMenuWrapper>
        {filterDropdown}
      </FilterDropdownMenuWrapper>
    ) : (
      <FilterDropdownMenuWrapper className={`${prefixCls}-dropdown`}>
        <Menu
          multiple={multiple}
          onClick={this.handleMenuItemClick}
          prefixCls={`${dropdownPrefixCls}-menu`}
          className={dropdownMenuClass}
          onSelect={this.setSelectedKeys}
          onDeselect={this.setSelectedKeys}
          selectedKeys={this.state.selectedKeys}
          getPopupContainer={(triggerNode: HTMLElement) => triggerNode.parentNode}
        >
          {this.renderMenus(column.filters!)}
        </Menu>
        <div className={`${prefixCls}-dropdown-btns`}>
          <a
            className={`${prefixCls}-dropdown-link confirm`}
            onClick={this.handleConfirm}
          >
            {locale.filterConfirm}
          </a>
          <a
            className={`${prefixCls}-dropdown-link clear`}
            onClick={this.handleClearFilters}
          >
            {locale.filterReset}
          </a>
        </div>
      </FilterDropdownMenuWrapper>
    );

    return (
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        overlay={menus}
        visible={this.getDropdownVisible()}
        onVisibleChange={this.onVisibleChange}
        getPopupContainer={getPopupContainer}
        forceRender
      >
        {this.renderFilterIcon()}
      </Dropdown>
    );
  }
}
