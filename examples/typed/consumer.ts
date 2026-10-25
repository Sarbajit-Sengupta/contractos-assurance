import type {components} from './api';
export const render=(item:components['schemas']['Item'])=>item.name.toUpperCase();
