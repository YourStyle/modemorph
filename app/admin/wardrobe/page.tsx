import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { useRouter } from 'next/router';
import { Button } from '@ui/components/ui/button';
import { WardrobeItem } from '@app/types';
import { fetch } from '@app/utils/fetch';

const WardrobePage = () => {
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode'); // 'create' или 'edit'
  const outfitId = searchParams.get('outfitId');

  const [isCreatingOutfit, setIsCreatingOutfit] = useState(mode === 'create');
  const [editingOutfitId, setEditingOutfitId] = useState<string | null>(outfitId);
  const [selectedItems, setSelectedItems] = useState<WardrobeItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<WardrobeItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (mode === 'edit' && outfitId) {
      loadOutfitForEdit(outfitId);
    } else if (mode === 'create') {
      setIsCreatingOutfit(true);
      setSelectedItems([]);
    }
  }, [mode, outfitId]);

  const loadOutfitForEdit = async (id: string) => {
    try {
      const response = await fetch(`/api/outfits/${id}`);
      if (response.ok) {
        const outfit = await response.json();
        setEditingOutfitId(id);
        setIsCreatingOutfit(true);
        // Установить выбранные элементы из образа
        const outfitItems = outfit.outfit_items.map((item: any) => item.wardrobe_items);
        setSelectedItems(outfitItems);
      }
    } catch (error) {
      console.error('Error loading outfit for edit:', error);
      toast({
        title: 'Ошибка',
        description: 'Не удалось загрузить образ для редактирования',
        variant: 'destructive'
      });
    }
  };

  const handleItemClick = (item: WardrobeItem) => {
    if (isCreatingOutfit) {
      const isSelected = selectedItems.some(selected => selected.id === item.id);
      if (isSelected) {
        setSelectedItems(selectedItems.filter(selected => selected.id !== item.id));
      } else {
        setSelectedItems([...selectedItems, item]);
      }
    } else {
      setSelectedItem(item);
      setIsModalOpen(true);
    }
  };

  return (
    <div>
      <h1>Компонент гардероба</h1>
      {isCreatingOutfit && (
        <Button 
          variant="outline" 
          onClick={() => {
            setIsCreatingOutfit(false);
            setEditingOutfitId(null);
            setSelectedItems([]);
            router.push('/admin/wardrobe');
          }}
        >
          Отменить
        </Button>
      )}
      {/* Остальная часть кода здесь */}
    </div>
  );
};

export default WardrobePage;
