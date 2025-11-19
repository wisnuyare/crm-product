import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

interface ProductData {
  id?: string;
  name: string;
  price: number;
  stock_quantity: number;
  description?: string;
  category?: string;
  sku?: string;
}

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editProduct?: ProductData;
}

export default function ProductModal({ isOpen, onClose, onSuccess, editProduct }: ProductModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');

  const isEditMode = !!editProduct;

  useEffect(() => {
    if (isEditMode && editProduct) {
      setName(editProduct.name || '');
      setPrice(editProduct.price?.toString() || '');
      setStock(editProduct.stock_quantity?.toString() || '');
      setDescription(editProduct.description || '');
      setCategory(editProduct.category || '');
      setSku(editProduct.sku || '');
    } else {
      // Reset form for create mode
      setName('');
      setPrice('');
      setStock('');
      setDescription('');
      setCategory('');
      setSku('');
    }
  }, [editProduct, isEditMode, isOpen]);

  const createMutation = useMutation({
    mutationFn: (newProduct: Omit<ProductData, 'id'>) => api.order.post('/api/v1/products', newProduct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product created successfully');
      onSuccess();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(`Failed to create product: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (updatedProduct: ProductData) => api.order.put(`/api/v1/products/${updatedProduct.id}`, updatedProduct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product updated successfully');
      onSuccess();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(`Failed to update product: ${error.message}`);
    },
  });

  const mutation = isEditMode ? updateMutation : createMutation;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const productData = {
      name,
      price: parseFloat(price),
      stock_quantity: parseInt(stock, 10),
      description,
      category,
      sku,
    };

    if (isEditMode && editProduct) {
      updateMutation.mutate({ ...productData, id: editProduct.id });
    } else {
      createMutation.mutate(productData);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? 'Edit Product' : 'Add Product'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Product Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="price">Price</Label>
            <Input id="price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="stock">Stock Quantity</Label>
            <Input id="stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} required />
          </div>
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
        </div>
        {mutation.isError && (
          <p className="text-sm text-red-500">{mutation.error.message}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 border border-gray-300 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
          >
            Cancel
          </button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (isEditMode ? 'Saving...' : 'Adding...') : (isEditMode ? 'Save Changes' : 'Add Product')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}