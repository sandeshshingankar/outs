'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ExternalLink, Megaphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Advertisement = { id: string; title: string; brand_name: string; description: string; image_path: string | null; destination_url: string; category: string; };

function sendEvent(id: string, type: 'impression' | 'click') {
  void fetch('/api/advertisements/event', {
    method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ id, type }),
  });
}

export default function SponsoredAds() {
  const supabase = useMemo(() => createClient(), []);
  const [ads, setAds] = useState<Advertisement[]>([]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.from('advertisements')
        .select('id,title,brand_name,description,image_path,destination_url,category')
        .eq('status','approved').eq('payment_status','paid').lte('starts_at',new Date().toISOString().slice(0,10)).limit(1);
      if (!active || !data) return;
      const eligible = data as Advertisement[];
      setAds(eligible);
      const today = new Date().toISOString().slice(0,10);
      for (const ad of eligible) {
        const seenKey = `outs-ad-seen:${ad.id}:${today}`;
        if (!localStorage.getItem(seenKey)) {
          localStorage.setItem(seenKey, '1');
          sendEvent(ad.id, 'impression');
        }
      }
    })();
    return () => { active = false; };
  }, [supabase]);
  if (!ads.length) return null;
  return <section className="sponsored-ad-list" aria-label="Sponsored advertisements">{ads.map((ad) => {
    const imageUrl = ad.image_path ? supabase.storage.from('outs-ad-creatives').getPublicUrl(ad.image_path).data.publicUrl : null;
    return <article className="sponsored-ad" key={ad.id}>
      <div className="sponsored-ad-copy"><span className="sponsored-label"><Megaphone size={12} /> Advertisement</span><small>{ad.brand_name} · {ad.category}</small><h3>{ad.title}</h3><p>{ad.description}</p><a href={ad.destination_url} target="_blank" rel="noopener noreferrer" onClick={() => sendEvent(ad.id,'click')}>Visit website <ExternalLink size={13} /></a></div>
      {imageUrl && <Image src={imageUrl} alt={`${ad.brand_name} banner`} width={450} height={300} unoptimized />}
    </article>;
  })}</section>;
}
