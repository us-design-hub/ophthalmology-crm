'use client';
import {useLocale} from '../locale-provider';
export function PrintButton(){const {t}=useLocale();return <div className="ops-print-toolbar"><button type="button" className="primary-button" onClick={()=>window.print()}>{t('reportPrint')}</button><a href="/">{t('reportBack')}</a></div>;}
