import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  StyleSheet, 
  Text, 
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  Animated,
  PanResponder,
  Platform,
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
  Keyboard,
  Alert
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, KeyboardGestureArea } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { FileSystemUploadType } from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { supabase } from '../supabase';
import CachedImage from './CachedImage';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { encrypt, decrypt } from '../crypto';

const { width, height } = Dimensions.get('window');

// Başlangıç sistemi/oda bilgilendirme mesajı
const INITIAL_MESSAGES = [
  {
    id: 'system-welcome',
    sender: 'system',
    text: '🔒 ANTA Ortak Güvenli Kanalı oluşturuldu. Bu odadaki herkes mesajları görebilir.',
    timestamp: '--:--',
    type: 'system'
  }
];

// Orijinal görsel en/boy oranına göre dinamik olarak şekillenen Önbellekli Image bileşeni
const aspectCache = {};

const ChatImage = ({ uri, onPress, onLongPress, onError }) => {
  const [aspectRatio, setAspectRatio] = useState(aspectCache[uri] || 1.33); // Önbellekten veya varsayılan 4:3 oran

  useEffect(() => {
    if (uri && !aspectCache[uri]) {
      Image.getSize(
        uri,
        (w, h) => {
          if (w && h) {
            const ratio = w / h;
            aspectCache[uri] = ratio;
            setAspectRatio(ratio);
          }
        },
        (err) => {
          console.log("Görsel boyutları alınamadı:", err);
        }
      );
    }
  }, [uri]);

  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.9}>
      <View style={[styles.bubbleImageWrapper, { aspectRatio }]}>
        <CachedImage 
          uri={uri} 
          style={styles.bubbleImage} 
          resizeMode="cover" 
          onError={onError}
        />
      </View>
    </TouchableOpacity>
  );
};

// WhatsApp tarzı: mesajı sağa kaydırınca yanıtla (swipe-to-reply)
const SwipeableMessage = ({ children, onReply }) => {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      // Sadece belirgin yatay (sağa) kaydırmada devreye gir; dikey scroll'a karışma
      onMoveShouldSetPanResponder: (_, g) =>
        g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) {
          translateX.setValue(Math.min(g.dx, 90));
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx >= 60 && onReply) onReply();
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const iconOpacity = translateX.interpolate({
    inputRange: [0, 40, 60],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });
  const iconScale = translateX.interpolate({
    inputRange: [0, 60],
    outputRange: [0.6, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.swipeRow}>
      <Animated.View
        style={[styles.swipeReplyIcon, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}
        pointerEvents="none"
      >
        <Ionicons name="arrow-undo" size={18} color="#00FF87" />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
};

// Bir mesajı yanıtlamak (alıntılamak) için önizleme metni üret (saf fonksiyon)
const buildReplyPreview = (item) => {
  if (item.type === 'image') return '📷 Fotoğraf';
  if (item.type === 'video') return '🎥 Video';
  return item.text;
};

// Tek mesaj satırı — React.memo ile sarıldı; yalnızca kendi item'i değişince
// yeniden render olur. Böylece input'a her yazışta tüm liste re-render olmaz.
const ChatMessageRow = React.memo(function ChatMessageRow({ item, currentUsername, onReply, onOpenMedia, onDelete }) {
  if (item.type === 'system') {
    return (
      <View style={styles.systemMessageContainer}>
        <Text style={styles.systemMessageText}>{item.text}</Text>
      </View>
    );
  }

  const isSelf = item.sender === currentUsername;

  return (
    <SwipeableMessage onReply={() => onReply(item)}>
      <View style={[styles.bubbleWrapper, isSelf ? styles.selfWrapper : styles.otherWrapper]}>
        <Text style={[styles.senderName, isSelf ? styles.selfSenderName : styles.otherSenderName]}>
          {item.sender}
        </Text>

        <Pressable
          onLongPress={() => onDelete(item)}
          delayLongPress={350}
          style={[styles.bubble, isSelf ? styles.selfBubble : styles.otherBubble]}
        >

        {/* Alıntılanan (yanıtlanan) mesaj bloğu */}
        {item.replyToId && (
          <View style={styles.replyQuote}>
            <Text style={styles.replyQuoteSender} numberOfLines={1}>{item.replyToSender}</Text>
            <Text style={styles.replyQuoteText} numberOfLines={1}>{item.replyToText}</Text>
          </View>
        )}

        {/* Render Text */}
        {item.type === 'text' && (
          <Text style={styles.messageText}>{item.text}</Text>
        )}

        {/* Render Image */}
        {item.type === 'image' && (
          <View>
            <ChatImage
              uri={item.thumbnailUri || item.uri}
              onPress={() => onOpenMedia({ type: 'image', uri: item.uri, thumbnailUri: item.thumbnailUri })}
              onLongPress={() => onDelete(item)}
              onError={(e) => console.log("Mesaj Balonu Görsel Yükleme Hatası:", e.nativeEvent.error, "URI:", item.uri)}
            />
            {item.text && item.text !== 'Fotoğraf Gönderildi' ? (
              <Text style={[styles.messageText, styles.mediaText]}>{item.text}</Text>
            ) : null}
          </View>
        )}

        {/* Render Video */}
        {item.type === 'video' && (
          <TouchableOpacity onPress={() => onOpenMedia({ type: 'video', uri: item.uri })} onLongPress={() => onDelete(item)} activeOpacity={0.9}>
            <View style={styles.videoThumbnailContainer}>
              {item.thumbnailUri ? (
                <CachedImage
                  uri={item.thumbnailUri}
                  style={styles.bubbleImage}
                  resizeMode="cover"
                  onError={(e) => console.log("Video thumbnail yükleme hatası:", e.nativeEvent?.error)}
                />
              ) : (
                <View style={styles.videoPlaceholder}>
                  <Ionicons name="film-outline" size={40} color="#374151" />
                </View>
              )}
              <View style={styles.playButtonOverlay}>
                <Ionicons name="play-circle-sharp" size={48} color="#00FF87" />
              </View>
            </View>
            {item.text && item.text !== 'Video Gönderildi' ? (
              <Text style={[styles.messageText, styles.mediaText]}>{item.text}</Text>
            ) : null}
          </TouchableOpacity>
        )}

        <View style={styles.messageMeta}>
          <Text style={styles.timestampText}>{item.timestamp}</Text>
          {isSelf && <Ionicons name="shield-checkmark" size={13} color="#00FF87" style={styles.checkmarkIcon} />}
        </View>

        </Pressable>
      </View>
    </SwipeableMessage>
  );
});

export default function ChatScreen({ username, onOpenSettings }) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // Alıntılanan (yanıtlanan) mesaj

  // Sohbet içi arama (find)
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Media Preview ve Kırpma (Crop) durumları
  const [tempMedia, setTempMedia] = useState(null); // { uri, type, width, height }
  const [mediaPreviewVisible, setMediaPreviewVisible] = useState(false);
  
  const [activeMedia, setActiveMedia] = useState(null); // Tam ekran Lightbox izleyici
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false); // Kaydetme yükleme durumu
  const flatListRef = useRef(null);

  const userSentMessageRef = useRef(false);
  const isCloseToBottom = useRef(true);
  const deleteGuardRef = useRef(false); // aynı anda iki silme onayı açılmasını engeller
  const initialScrollDoneRef = useRef(false); // sohbete girişte bir kez en alta kaydırmak için

  // Lightbox Aşağı Kaydırarak Kapatma ve İndirme Mantığı
  let touchStartY = 0;

  const handleTouchStart = (e) => {
    touchStartY = e.nativeEvent.pageY;
  };

  const handleTouchEnd = (e) => {
    const touchEndY = e.nativeEvent.pageY;
    const deltaY = touchEndY - touchStartY;
    if (deltaY > 80) { // 80px aşağı kaydırılınca kapat
      setActiveMedia(null);
    }
  };

  const handleDownloadMedia = async () => {
    if (!activeMedia?.uri) return;

    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Medya dosyasını kaydetmek için galeri erişim izni vermeniz gerekmektedir.');
      return;
    }

    setDownloading(true);

    try {
      const fileUri = activeMedia.uri;
      const fileExtension = fileUri.split('.').pop()?.split('?')[0] || 'jpg';
      const localFilename = `anta-media-${Date.now()}.${fileExtension}`;
      const localUri = `${FileSystem.documentDirectory}${localFilename}`;

      // Dosyayı geçici olarak yerel diske indir
      const downloadResult = await FileSystem.downloadAsync(fileUri, localUri);

      if (downloadResult.status !== 200) {
        throw new Error('Dosya sunucudan indirilemedi.');
      }

      // Galeriye kaydet
      await MediaLibrary.saveToLibraryAsync(downloadResult.uri);
      Alert.alert('Başarılı', 'Medya başarıyla telefon galerinize kaydedildi.');
    } catch (err) {
      console.error('Kaydetme hatası:', err);
      Alert.alert('Hata', 'Dosya galeriye kaydedilirken bir hata oluştu.');
    } finally {
      setDownloading(false);
    }
  };

  // Supabase Veritabanından Mesajları Çek ve Canlı Dinleyicileri Başlat
  useEffect(() => {
    // 1. Eski mesajları veritabanından çek (Son 100 mesaj)
    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(100);

        if (data && !error) {
          const formatted = data.map(m => ({
            id: m.id,
            sender: m.sender_name,
            text: decrypt(m.text),
            uri: m.media_url,
            thumbnailUri: m.thumbnail_url,
            type: m.media_type,
            replyToId: m.reply_to_id,
            replyToSender: m.reply_to_sender,
            replyToText: decrypt(m.reply_to_text),
            timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));

          setMessages([INITIAL_MESSAGES[0], ...formatted]);
        }
      } catch (err) {
        console.error('Mesajlar yüklenirken hata oluştu:', err);
      }
    };
    fetchMessages();

    // 2. Yeni eklenen mesajları PostgreSQL Realtime Soket ile anlık dinle
    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' }, 
        (payload) => {
          const m = payload.new;
          
          setMessages(prev => {
            // Mükerrer (duplicate) kaydı engelle
            if (prev.some(item => item.id === m.id)) return prev;

            const formattedMessage = {
              id: m.id,
              sender: m.sender_name,
              text: decrypt(m.text),
              uri: m.media_url,
              thumbnailUri: m.thumbnail_url,
              type: m.media_type,
              replyToId: m.reply_to_id,
              replyToSender: m.reply_to_sender,
              replyToText: decrypt(m.reply_to_text),
              timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            return [...prev, formattedMessage];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          // DELETE olayında payload.old yalnızca birincil anahtarı (id) içerir.
          const deletedId = payload.old?.id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [username]);

  // Klavye açılınca son mesaja kaydır (klavyenin altında kalmasın).
  // 'keyboardDidShow' kullanıyoruz: klavye tamamen açılıp layout oturduktan
  // sonra tetiklenir, böylece scrollToEnd hedef ofseti doğru hesaplanır ve
  // son mesaj her zaman klavyenin üstünde görünür.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (searchQuery.trim()) return;
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, [searchQuery]);

  // Sohbete her girişte (mount) son mesaja in. Mesajlar ilk yüklendiğinde,
  // resimlerin yüksekliği oturana kadar birkaç kez animasyonsuz en alta kaydır.
  useEffect(() => {
    if (initialScrollDoneRef.current) return;
    if (messages.length <= 1) return; // henüz veri gelmedi (sadece sistem mesajı var)
    initialScrollDoneRef.current = true;

    const jump = () => flatListRef.current?.scrollToEnd({ animated: false });
    const raf = requestAnimationFrame(jump);
    const t1 = setTimeout(jump, 250);
    const t2 = setTimeout(jump, 600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [messages.length]);

  // Kullanıcının en altta olup olmadığını takip et
  const handleScroll = (event) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 150;
    isCloseToBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
  };

  // Liste içeriği büyüdüğünde (yeni mesaj / klavye) en alta kaydır.
  const handleContentSizeChange = () => {
    // Arama sırasında otomatik kaydırma yapma (sonuçlar zıplamasın)
    if (searchQuery.trim()) return;
    if (isCloseToBottom.current || userSentMessageRef.current) {
      flatListRef.current?.scrollToEnd({ animated: true });
      userSentMessageRef.current = false;
    }
  };

  // Aramaya göre gösterilecek mesajlar (boşken tüm mesajlar)
  const displayedMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) => m.type !== 'system' && (m.text || '').toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  const closeSearch = () => {
    setSearchVisible(false);
    setSearchQuery('');
  };

  // Stabil callback'ler — ChatMessageRow'un memo'sunu bozmamak için kimlikleri sabit
  const handleReplyTo = useCallback((item) => {
    if (!item || item.type === 'system') return;
    setReplyingTo({ id: item.id, sender: item.sender, preview: buildReplyPreview(item) });
  }, []);

  const handleOpenMedia = useCallback((media) => setActiveMedia(media), []);

  // Mesaja uzun basınca: onay al → veritabanından sil (herkesten silinir).
  // Silme realtime DELETE olayıyla her iki cihazdan da kaldırılır.
  const handleDeleteMessage = useCallback((item) => {
    if (!item || item.type === 'system') return;
    if (deleteGuardRef.current) return; // çift onay penceresini engelle
    deleteGuardRef.current = true;

    const release = () => { deleteGuardRef.current = false; };

    Alert.alert(
      'Mesajı Sil',
      'Bu mesaj her iki cihazdan da kalıcı olarak silinecek. Emin misin?',
      [
        { text: 'İptal', style: 'cancel', onPress: release },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            release();
            // Anında geri bildirim: yerelde hemen kaldır
            setMessages((prev) => prev.filter((m) => m.id !== item.id));
            try {
              const { error } = await supabase.from('messages').delete().eq('id', item.id);
              if (error) throw error;
            } catch (err) {
              console.error('Mesaj silinemedi:', err);
              Alert.alert('Hata', 'Mesaj silinemedi. Bağlantını kontrol et. (Tekrar açıldığında geri gelebilir.)');
            }
          },
        },
      ],
      { onDismiss: release }
    );
  }, []);

  const handleSendText = async () => {
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');

    // Yanıt (alıntı) bilgisini yakala ve önizleme barını kapat
    const currentReply = replyingTo;
    setReplyingTo(null);
    userSentMessageRef.current = true;

    // Mesajı Supabase veritabanına ekle
    try {
      const { error } = await supabase
        .from('messages')
        .insert([
          {
            sender_name: username || 'Anonim',
            text: encrypt(textToSend),
            media_type: 'text',
            ...(currentReply ? {
              reply_to_id: currentReply.id,
              reply_to_sender: currentReply.sender,
              reply_to_text: encrypt(currentReply.preview),
            } : {})
          }
        ]);

      if (error) throw error;
    } catch (err) {
      console.error('Mesaj gönderilemedi:', err);
      // Gönderim başarısızsa yazılan metni ve yanıtı geri yükle ki kullanıcı
      // tekrar deneyebilsin (kullanıcı bu arada yeni bir şey yazmadıysa).
      setInputText((curr) => (curr.length ? curr : textToSend));
      setReplyingTo((curr) => curr ?? currentReply);
      Alert.alert('Gönderim Hatası', 'Mesaj gönderilemedi. Bağlantını kontrol edip tekrar dene.');
    }
  };

  const pickMedia = async (type) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Galeri erişim izni vermeniz gerekmektedir.');
      return;
    }

    const options = {
      mediaTypes: type === 'image' ? ['images'] : ['videos'],
      allowsEditing: false, 
      quality: 0.9,
    };

    const result = await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setTempMedia(result.assets[0]);
      setMediaPreviewVisible(true);
    }
  };

  // Nativ Kırpma Aracını Çağır
  const handleCropImage = async () => {
    if (!tempMedia) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, 
      quality: 0.9,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setTempMedia(result.assets[0]);
    }
  };

  // Cloudflare R2'ye Güvenli Yükleme (Pre-signed URL) ve Mesaj Ekleme
  const handleSendMedia = async () => {
    if (!tempMedia) return;

    setMediaPreviewVisible(false);
    setUploading(true);

    // Yanıt (alıntı) bilgisini yakala ve önizleme barını kapat
    const currentReply = replyingTo;
    setReplyingTo(null);
    userSentMessageRef.current = true;

    try {
      const originalFilename = tempMedia.uri.split('/').pop() || 'media.jpg';
      const isVideo = tempMedia.type === 'video' || tempMedia.uri.endsWith('.mp4');
      const contentType = isVideo ? 'video/mp4' : 'image/jpeg';

      let thumbnailPublicUrl = null;

      // 1. Thumbnail (küçük önizleme) üret:
      //    - Görselde doğrudan kaynaktan
      //    - Videoda ise önce ilk kareyi çıkar, sonra onu küçült
      try {
        let thumbnailSourceUri;

        if (isVideo) {
          console.log('Video karesi (thumbnail) çıkarılıyor...');
          const { uri: frameUri } = await VideoThumbnails.getThumbnailAsync(tempMedia.uri, {
            time: 1000, // 1. saniyeden kare al
            quality: 0.7,
          });
          thumbnailSourceUri = frameUri;
        } else {
          thumbnailSourceUri = tempMedia.uri;
        }

        console.log('Thumbnail oluşturuluyor...');
        const manipResult = await ImageManipulator.manipulateAsync(
          thumbnailSourceUri,
          [{ resize: { width: 300 } }], // Genişlik 300px, en/boy oranı korunur
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );

        console.log('Thumbnail R2 yükleme adresi alınıyor...');
        // Uzantıyı .jpg'e sabitle (video için orijinal .mp4 olabilir)
        const baseName = originalFilename.replace(/\.[^.]+$/, '');
        const thumbFilename = `thumb_${Date.now()}_${baseName}.jpg`;
        const { data: thumbEdgeData, error: thumbEdgeError } = await supabase.functions.invoke('r2-uploader', {
          body: { filename: thumbFilename, contentType: 'image/jpeg' }
        });

        if (thumbEdgeError || !thumbEdgeData) {
          throw new Error(thumbEdgeError?.message || 'Thumbnail için yükleme adresi üretilemedi.');
        }

        console.log('Thumbnail R2ye yükleniyor...');
        const thumbUploadResult = await FileSystem.uploadAsync(thumbEdgeData.uploadUrl, manipResult.uri, {
          httpMethod: 'PUT',
          headers: {
            'Content-Type': 'image/jpeg',
          },
          uploadType: FileSystemUploadType.BINARY_CONTENT
        });

        if (thumbUploadResult.status === 200 || thumbUploadResult.status === 201) {
          thumbnailPublicUrl = thumbEdgeData.publicUrl;
          console.log('Thumbnail başarıyla yüklendi:', thumbnailPublicUrl);
        } else {
          console.log('Thumbnail yüklemesi başarısız oldu, durum kodu:', thumbUploadResult.status);
        }
      } catch (manipErr) {
        console.log('Thumbnail adımı atlanıyor:', manipErr);
      }

      // 2. Supabase Edge Function'dan Orijinal Medya için Cloudflare R2 Pre-signed URL al
      console.log('Orijinal medya yükleme adresi alınıyor...');
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('r2-uploader', {
        body: { filename: originalFilename, contentType }
      });

      if (edgeError || !edgeData) {
        throw new Error(edgeError?.message || 'Edge Function yükleme adresi üretemedi.');
      }

      const { uploadUrl, publicUrl } = edgeData;

      // 3. FileSystem.uploadAsync ile doğrudan Cloudflare R2'ye orijinal binary yükle (PUT)
      console.log('Orijinal medya R2ye yükleniyor...');
      const uploadResult = await FileSystem.uploadAsync(uploadUrl, tempMedia.uri, {
        httpMethod: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        uploadType: FileSystemUploadType.BINARY_CONTENT
      });

      if (uploadResult.status !== 200 && uploadResult.status !== 201) {
        throw new Error(`Dosya Cloudflare R2 depolama alanına yüklenemedi. Durum Kodu: ${uploadResult.status}`);
      }

      // 4. Supabase Mesajlar tablosuna Cloudflare linkleriyle beraber ekle
      console.log('Mesaj veritabanına ekleniyor...');
      const { error: dbError } = await supabase
        .from('messages')
        .insert([
          {
            sender_name: username || 'Anonim',
            text: isVideo ? 'Video Gönderildi' : 'Fotoğraf Gönderildi',
            media_url: publicUrl,
            thumbnail_url: thumbnailPublicUrl, // Küçük resim linki
            media_type: isVideo ? 'video' : 'image',
            ...(currentReply ? {
              reply_to_id: currentReply.id,
              reply_to_sender: currentReply.sender,
              reply_to_text: encrypt(currentReply.preview),
            } : {})
          }
        ]);

      if (dbError) throw dbError;
      
      setTempMedia(null);
    } catch (err) {
      console.error('Medya yüklenemedi:', err);
      Alert.alert(
        'Yükleme Başarısız', 
        `Fotoğraf/Video sunucuya yüklenirken bir sorun oluştu.\n\nHata: ${err.message || err}`
      );
    } finally {
      setUploading(false);
    }
  };

  const renderMessageItem = useCallback(({ item }) => (
    <ChatMessageRow
      item={item}
      currentUsername={username}
      onReply={handleReplyTo}
      onOpenMedia={handleOpenMedia}
      onDelete={handleDeleteMessage}
    />
  ), [username, handleReplyTo, handleOpenMedia, handleDeleteMessage]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Custom Header - Outside of KeyboardAvoidingView so it does not get pushed up */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>O</Text>
            <View style={styles.activeDot} />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>ANTA Ortak Oda</Text>
            <View style={styles.secureBadge}>
              <Ionicons name="lock-closed" size={10} color="#00FF87" />
              <Text style={styles.secureBadgeText}>GÜVENLİ KANAL ({username})</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setSearchVisible((v) => !v)}
          >
            <Ionicons name={searchVisible ? 'search' : 'search-outline'} size={22} color="#00FF87" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsButton} onPress={onOpenSettings}>
            <Ionicons name="settings-sharp" size={22} color="#00FF87" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sohbet içi arama çubuğu */}
      {searchVisible && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Mesajlarda ara..."
            placeholderTextColor="#4B5563"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.trim() ? (
            <Text style={styles.searchCount}>{displayedMessages.length} sonuç</Text>
          ) : null}
          <TouchableOpacity onPress={closeSearch} style={styles.searchClose}>
            <Ionicons name="close" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Message Feed — KeyboardGestureArea: parmakla aşağı sürükleyerek
            klavyeyi interaktif kapatma (WhatsApp gibi, iOS + Android) */}
        <KeyboardGestureArea interactive style={styles.gestureArea}>
          <FlatList
            ref={flatListRef}
            data={displayedMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.feedContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={handleContentSizeChange}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={11}
            removeClippedSubviews={false}
            ListEmptyComponent={
              searchQuery.trim() ? (
                <View style={styles.searchEmpty}>
                  <Ionicons name="search-outline" size={40} color="#1E293B" />
                  <Text style={styles.searchEmptyText}>"{searchQuery.trim()}" için sonuç yok</Text>
                </View>
              ) : null
            }
          />
        </KeyboardGestureArea>

        {/* Uploading indicator */}
        {uploading && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="small" color="#00FF87" />
            <Text style={styles.uploadingText}>Dosya şifreleniyor ve gönderiliyor...</Text>
          </View>
        )}

        {/* Yanıt (Alıntı) Önizleme Barı */}
        {replyingTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarAccent} />
            <View style={styles.replyBarContent}>
              <Text style={styles.replyBarSender} numberOfLines={1}>
                {replyingTo.sender} kişisine yanıt
              </Text>
              <Text style={styles.replyBarText} numberOfLines={1}>{replyingTo.preview}</Text>
            </View>
            <TouchableOpacity style={styles.replyBarClose} onPress={() => setReplyingTo(null)}>
              <Ionicons name="close" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Input Action Bar */}
        <View style={styles.inputContainer}>
          <View style={styles.mediaButtons}>
            <TouchableOpacity style={styles.mediaBtn} onPress={() => pickMedia('image')}>
              <Ionicons name="image-outline" size={24} color="#00FF87" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtn} onPress={() => pickMedia('video')}>
              <Ionicons name="videocam-outline" size={24} color="#00FF87" />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.textInput}
            placeholder="Güvenli mesaj yazın..."
            placeholderTextColor="#4B5563"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />

          <TouchableOpacity 
            style={[styles.sendButton, !inputText.trim() ? styles.sendButtonDisabled : null]} 
            onPress={handleSendText}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={18} color="#0B0F19" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Lightbox Modal for Media Previews */}
      <Modal
        visible={activeMedia !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setActiveMedia(null)}
      >
        <View 
          style={styles.lightboxOverlay}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Lightbox Üst Kontrol Paneli */}
          <View style={styles.lightboxHeader}>
            <TouchableOpacity style={styles.lightboxBtn} onPress={handleDownloadMedia} disabled={downloading}>
              {downloading ? (
                <ActivityIndicator size="small" color="#00FF87" />
              ) : (
                <Ionicons name="download-outline" size={24} color="#00FF87" />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.lightboxBtn} onPress={() => setActiveMedia(null)}>
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.lightboxContent}>
            {activeMedia?.type === 'image' && (
              // Önce thumbnail (placeholder) anında görünür, net hali yüklenince
              // yumuşak geçişle belirir; çevrimdışıysa thumbnail kalır.
              <CachedImage
                uri={activeMedia.uri}
                placeholder={activeMedia.thumbnailUri}
                style={styles.lightboxImage}
                resizeMode="contain"
                transition={200}
                onError={(e) => console.log("Lightbox Orijinal Görsel Yükleme Hatası:", e.nativeEvent?.error)}
              />
            )}
            
            {activeMedia?.type === 'video' && (
              <Video
                style={styles.lightboxVideo}
                source={{ uri: activeMedia.uri }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                isLooping
                shouldPlay
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Media Crop & Full Preview Screen Modal */}
      <Modal
        visible={mediaPreviewVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setMediaPreviewVisible(false)}
      >
        <SafeAreaView style={styles.previewModalOverlay} edges={['left', 'right', 'bottom']}>
          <View style={[styles.previewHeader, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setMediaPreviewVisible(false)}>
              <Text style={styles.previewCloseText}>Vazgeç</Text>
            </TouchableOpacity>
            
            <Text style={styles.previewTitle}>Medya Gönderimi</Text>
            
            {tempMedia && tempMedia.type === 'image' ? (
              <TouchableOpacity style={styles.previewCropBtn} onPress={handleCropImage}>
                <Ionicons name="crop-sharp" size={20} color="#00FF87" />
                <Text style={styles.previewCropText}>Kırp</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 60 }} />
            )}
          </View>

          <View style={styles.previewContent}>
            {tempMedia?.type === 'image' && (
              <Image 
                source={{ uri: tempMedia.uri }} 
                style={styles.previewImageFull} 
                resizeMode="contain" 
                onError={(e) => console.log("Önizleme Görsel Yükleme Hatası:", e.nativeEvent.error, "URI:", tempMedia.uri)}
              />
            )}
            {tempMedia?.type === 'video' && (
              <Video
                style={styles.previewVideoFull}
                source={{ uri: tempMedia.uri }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isLooping
              />
            )}
          </View>

          <View style={styles.previewFooter}>
            <TouchableOpacity style={styles.previewSendBtn} onPress={handleSendMedia}>
              <Text style={styles.previewSendText}>Medyayı Gönder</Text>
              <Ionicons name="checkmark-circle" size={22} color="#0B0F19" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  keyboardContainer: {
    flex: 1,
  },
  gestureArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#00FF87',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    color: '#00FF87',
    fontSize: 18,
    fontWeight: '900',
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00FF87',
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  headerTextContainer: {
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  secureBadgeText: {
    fontSize: 9,
    color: '#9CA3AF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  settingsButton: {
    padding: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  searchInput: {
    flex: 1,
    color: '#F3F4F6',
    fontSize: 14,
    padding: 0,
  },
  searchCount: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
  },
  searchClose: {
    padding: 4,
  },
  searchEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 60,
  },
  searchEmptyText: {
    color: '#4B5563',
    fontSize: 13,
  },
  feedContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  systemMessageContainer: {
    alignSelf: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.15)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginVertical: 10,
    maxWidth: '90%',
  },
  systemMessageText: {
    color: '#9CA3AF',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  swipeRow: {
    justifyContent: 'center',
  },
  swipeReplyIcon: {
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleWrapper: {
    maxWidth: '80%',
    marginVertical: 2,
  },
  selfWrapper: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  otherWrapper: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  senderName: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 8,
  },
  selfSenderName: {
    color: '#00FF87',
    marginRight: 8,
    textAlign: 'right',
  },
  otherSenderName: {
    color: '#38BDF8', 
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'relative',
  },
  selfBubble: {
    backgroundColor: '#059669', 
    borderTopRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#1F2937', 
    borderTopLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#F3F4F6',
    lineHeight: 20,
  },
  mediaText: {
    marginTop: 8,
  },
  replyQuote: {
    borderLeftWidth: 3,
    borderLeftColor: '#00FF87',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  replyQuoteSender: {
    color: '#00FF87',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 1,
  },
  replyQuoteText: {
    color: '#D1D5DB',
    fontSize: 12,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  replyBarAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: '#00FF87',
  },
  replyBarContent: {
    flex: 1,
  },
  replyBarSender: {
    color: '#00FF87',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  replyBarText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  replyBarClose: {
    padding: 4,
  },
  bubbleImageWrapper: {
    width: 220,
    maxHeight: 280,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1F2937',
    position: 'relative',
  },
  bubbleImage: {
    width: '100%',
    height: '100%',
  },
  bubbleImageLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    zIndex: 1,
  },
  videoThumbnailContainer: {
    position: 'relative',
    width: 220,
    aspectRatio: 1.33,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1F2937',
  },
  videoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  playButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  messageMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  timestampText: {
    fontSize: 9,
    color: '#D1D5DB',
    opacity: 0.8,
  },
  checkmarkIcon: {
    marginLeft: 2,
  },
  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(11, 15, 25, 0.9)',
  },
  uploadingText: {
    fontSize: 11,
    color: '#00FF87',
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
    paddingBottom: 12,
  },
  mediaButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  mediaBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#F3F4F6',
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#00FF87',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#1E293B',
    shadowOpacity: 0,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  lightboxHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  lightboxBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(31, 41, 55, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  lightboxContent: {
    width: width,
    height: height * 0.75,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxVideo: {
    width: '100%',
    height: '100%',
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: '#030712',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  previewCloseBtn: {
    padding: 8,
  },
  previewCloseText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  previewCropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  previewCropText: {
    color: '#00FF87',
    fontSize: 13,
    fontWeight: '600',
  },
  previewContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
  },
  previewImageFull: {
    width: width,
    height: height * 0.65,
  },
  previewVideoFull: {
    width: width,
    height: height * 0.65,
  },
  previewFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#030712',
  },
  previewSendBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#00FF87',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  previewSendText: {
    fontSize: 15,
    color: '#0B0F19',
    fontWeight: '700',
  }
});
