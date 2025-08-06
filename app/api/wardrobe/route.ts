import { createRouter } from 'next-connect';
import { supabase } from '@/lib/supabase';

const router = createRouter();

router.get(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let query = supabase
    .from('wardrobe_items')
    .select('*')
    .order('created_at', { ascending: false });

  const showHidden = url.searchParams.get('show_hidden');
  if (!showHidden || showHidden !== 'true') {
    query = query.eq('is_hidden', false);
  }

  const { data: items, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
  } else {
    res.status(200).json(items);
  }
});

export default router;
