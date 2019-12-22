import {
  BreadCrumb,
  TrackerConfig,
  Tracker,
  Node,
  HashMap,
  MetaDataType,
  BaseError
} from './types';
import { environment, createNode, freeze } from './utils';
import logger from './logger';

const MAX_NUM_BREADCRUMBS = 500;
const MAX_NUM_BREADCRUMBS_ATTACHED = 10;
const KEEP_ALIVE = 24;

export default function createTracker(config: TrackerConfig): Tracker {
  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - KEEP_ALIVE);

  // flags usued for sync with local storage
  const _logTag = `vitamins_${config.namespace}_errors`;
  const _crumbsTag = `vitamins_${config.namespace}_crumbs`;
  const _meta = environment(config);
  // crumbs older than the keep alive period (in hours) are removed on load
  let _crumbs: BreadCrumb[] = JSON.parse(
    localStorage.getItem(_crumbsTag) || '[]'
  ).filter((l: BreadCrumb) => l.timestamp >= yesterday.toISOString());
  // logs older than the keep alive period (in hours) are removed on load
  let _logs: Node[] = JSON.parse(localStorage.getItem(_logTag) || '[]').filter(
    (l: Node) => l.timestamp >= yesterday.toISOString()
  );

  // function to add a crumb to the internal list
  function addCrumb(
    message: string,
    category: string,
    metadata?: HashMap<MetaDataType>
  ): void {
    if (_crumbs.length >= MAX_NUM_BREADCRUMBS) _crumbs.pop();
    const timestamp = new Date().toISOString();
    logger(category, message, metadata);
    _crumbs.unshift({ timestamp, message, category, metadata });
  }

  // function to create a new node for the logs and add it to the logs
  function addNode(error: BaseError, tags?: string[]): void {
    const node: Node = createNode(error, _meta.get(), tags);

    if (_crumbs.length > 0)
      node.breadcrumbs = _crumbs.slice(0, MAX_NUM_BREADCRUMBS_ATTACHED);

    logger('error', node.error.message, node.error.stack);
    _logs.unshift(node);
  }

  // Listener to window events for storing the logs
  window.addEventListener('beforeunload', function() {
    localStorage.setItem(_logTag, JSON.stringify(_logs));
    localStorage.setItem(_crumbsTag, JSON.stringify(_crumbs));
  });

  // Listeners to window events for capturation errors
  window.addEventListener('error', function(event) {
    addNode(event.error, ['window']);
  });

  // Listeners to window events for capturation errors
  window.addEventListener('unhandledrejection', function(event) {
    const error = new Error(JSON.stringify(event.reason));
    addNode(error, ['promise']);
  });

  return {
    crumb: addCrumb,
    send: addNode,
    clear(): void {
      _logs = [];
      _crumbs = [];
    },
    get crumbs(): BreadCrumb[] {
      return _crumbs;
    },
    get errors(): Node[] {
      return freeze([..._logs]);
    }
  };
}
