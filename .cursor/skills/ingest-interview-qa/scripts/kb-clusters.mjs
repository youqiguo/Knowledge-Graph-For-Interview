/**
 * 面经 QA → 知识点聚类定义
 * title/content 是知识点本身；qaIds 挂到 interviewQA；related 写 relatedIds
 */
export const THEME_TO_CAT = {
  'C++基础': { id: 'cat_cpp', title: 'C++基础', content: 'C++ 语言核心：内存、语法、对象模型与编译相关基础。' },
  '编程范式': { id: 'cat_paradigm', title: '编程范式', content: '函数式等编程范式与多范式实践。' },
  '面向对象与多态': { id: 'cat_oop', title: '面向对象与多态', content: '虚函数、多态、重载重写与抽象类。' },
  '操作系统': { id: 'cat_os', title: '操作系统', content: '进程线程、同步、虚拟内存与链接加载。' },
  'STL与数据结构': { id: 'cat_stl', title: 'STL与数据结构', content: '标准库容器、树图哈希与常用结构。' },
  '算法': { id: 'cat_algo', title: '算法', content: '排序、查找、DP 与常见手撕题。' },
  '智能指针与内存': { id: 'cat_smartptr', title: '智能指针与内存', content: '智能指针、泄漏与堆栈分配。' },
  '计算机网络': { id: 'cat_net', title: '计算机网络', content: 'TCP/UDP、同步与字节序。' },
  'C#与Unity': { id: 'cat_csharp_unity', title: 'C#与Unity', content: 'C# 语言特性与 Unity 运行时。' },
  '设计模式': { id: 'cat_pattern', title: '设计模式', content: '常用设计模式与游戏场景选型。' },
  '渲染与图形': { id: 'cat_render', title: '渲染与图形', content: '渲染管线、光照、合批与抗锯齿。' },
  '物理与碰撞': { id: 'cat_physics', title: '物理与碰撞', content: '碰撞体、宽窄相与空间划分。' },
  '数学与几何': { id: 'cat_math_geo', title: '数学与几何', content: '向量、四元数与变换。' },
  '数学与体系结构': { id: 'cat_math_arch', title: '数学与体系结构', content: '补码、定点数与数值表示。' },
  '游戏工程': { id: 'cat_game_eng', title: '游戏工程', content: 'ECS、状态机、UI 与玩法系统。' },
  '工具开发': { id: 'cat_tooling', title: '工具开发', content: '编辑器可用性与性能度量。' },
  '体系结构': { id: 'cat_arch', title: '体系结构', content: '缓存、伪共享与 CPU/OS 位宽。' },
  '工程与AI': { id: 'cat_eng_ai', title: '工程与AI', content: 'Agent/LLM 与调试方法。' },
};

/**
 * @typedef {{
 *   id: string,
 *   theme: string,
 *   title: string,
 *   content: string,
 *   tags: string[],
 *   qaIds: string[],
 *   related: string[]
 * }} Cluster
 */

/** @type {Cluster[]} */
export const CLUSTERS = [
  // —— C++ / 内存 ——
  {
    id: 'det_mem_layout',
    theme: 'C++基础',
    title: '进程内存布局',
    content:
      '进程虚拟地址空间通常划分为代码段、数据段、BSS、堆、栈及只读常量区等。C++ 对象还有自动/静态/动态/线程局部等存储期概念，与实现分区大致对应。',
    tags: ['内存', '布局'],
    qaIds: ['notes_cpp_mem_01', 'notes_cpp_mem_02', 'notes_cpp_mem_03', 'yuque_mem_layout_01', 'yuque_stack_heap_class_struct_01'],
    related: ['det_stack_overflow', 'det_ptr_regions', 'det_raii_new', 'det_smart_ptr', 'det_virtual_memory'],
  },
  {
    id: 'det_stack_overflow',
    theme: 'C++基础',
    title: '栈溢出',
    content:
      '栈空间耗尽会触发栈溢出。常见原因是递归过深或巨大局部数组；Windows 默认栈约 1MB，常表现为 Access Violation / STATUS_STACK_OVERFLOW。',
    tags: ['内存', '栈'],
    qaIds: ['notes_cpp_stack_overflow_01'],
    related: ['det_mem_layout', 'det_ptr_regions'],
  },
  {
    id: 'det_ptr_regions',
    theme: 'C++基础',
    title: '指针与地址空间',
    content:
      '指针可指向栈/堆/全局/代码/常量区等合法地址；零页通常不可访问，用于捕获空指针解引用。生命周期与权限错误会导致悬空或崩溃。',
    tags: ['指针', '内存'],
    qaIds: ['notes_cpp_ptr_regions_01'],
    related: ['det_mem_layout', 'det_ptr_ref', 'det_wild_ptr'],
  },
  {
    id: 'det_compile_pipeline',
    theme: 'C++基础',
    title: '编译流水线与优化',
    content:
      '经典阶段：预处理→编译→汇编→链接。优化主要在编译期 IR/后端；IPO/LTO 可跨函数或跨模块优化。内联、常量折叠、死代码消除等是常见手段。',
    tags: ['编译', '优化'],
    qaIds: ['notes_cpp_opt_01', 'notes_cpp_compile_stages_01', 'yuque_affect_compile_01', 'yuque_os_compile_link_01', 'yuque_reloc_01', 'yuque_forward_decl_01'],
    related: ['det_inline', 'det_auto', 'det_virtual_memory'],
  },
  {
    id: 'det_static',
    theme: 'C++基础',
    title: 'static 关键字',
    content:
      'static 可表示局部静态变量、内部链接的文件作用域实体、类静态成员/函数。类静态成员属类而非对象，对象销毁不会销毁它；与 sizeof(对象) 无关。',
    tags: ['语法', 'static'],
    qaIds: ['notes_cpp_static_01', 'yuque_static_sizeof_01', 'yuque_global_static_storage_01'],
    related: ['det_mem_layout', 'det_singleton'],
  },
  {
    id: 'det_ptr_ref',
    theme: 'C++基础',
    title: '指针与引用',
    content:
      '引用是别名，必须绑定且不可重绑、不可空；指针是存地址的变量，可空可改指向。传参优先引用表达“必有对象”，需要可选或改指向时用指针。',
    tags: ['指针', '引用'],
    qaIds: ['yuque_cpp_ptr_ref_01'],
    related: ['det_const', 'det_wild_ptr', 'det_ptr_regions'],
  },
  {
    id: 'det_const',
    theme: 'C++基础',
    title: 'const 与常量成员函数',
    content:
      'const int* 限制通过指针改值；int* const 限制改指向。成员函数后的 const 表示常量成员函数；可用 mutable 修改缓存等逻辑无关状态。',
    tags: ['const', '语法'],
    qaIds: ['yuque_cpp_const_ptr_01'],
    related: ['det_ptr_ref', 'det_cast'],
  },
  {
    id: 'det_object_layout',
    theme: 'C++基础',
    title: '对象布局与对齐',
    content:
      '空类至少 1 字节；有虚函数则含 vptr。结构体按成员对齐并在末尾补齐。this 指针通常作为隐藏参数传递，并不单独“存在堆或栈上某一固定区”。',
    tags: ['布局', '对齐'],
    qaIds: ['yuque_cpp_empty_class_01', 'yuque_cpp_align_01', 'yuque_cpp_this_01'],
    related: ['det_vtable', 'det_mem_layout', 'det_pod'],
  },
  {
    id: 'det_move_semantics',
    theme: 'C++基础',
    title: '左右值与移动语义',
    content:
      '左值可取地址、右值多为临时量。右值引用与移动构造/赋值转移资源所有权；std::move 只做类型转换。移动后应将源对象置为有效空状态。',
    tags: ['移动语义', '性能'],
    qaIds: ['yuque_cpp_lvalue_rvalue_01', 'yuque_cpp_deep_shallow_01'],
    related: ['det_smart_ptr', 'det_vector_list', 'det_raii_new'],
  },
  {
    id: 'det_ctor_init',
    theme: 'C++基础',
    title: '构造与初始化列表',
    content:
      '初始化列表在进入函数体前完成真正初始化；const/引用/无默认构造成员及基类通常必须用初始化列表，也避免多余默认构造再赋值。',
    tags: ['构造', '初始化'],
    qaIds: ['yuque_cpp_init_list_01'],
    related: ['det_move_semantics', 'det_object_layout'],
  },
  {
    id: 'det_pod',
    theme: 'C++基础',
    title: 'struct/class 与 POD',
    content:
      'struct/class 主要差在默认访问与默认继承权限。POD 指可与 C 互操作、可平凡拷贝的数据；C++11 后更常用 trivial 与 standard-layout 描述。',
    tags: ['类型', 'POD'],
    qaIds: ['yuque_cpp_struct_class_01', 'yuque_cpp_pod_01'],
    related: ['det_object_layout', 'det_mem_layout'],
  },
  {
    id: 'det_auto',
    theme: 'C++基础',
    title: 'auto 类型推导',
    content:
      'auto 在编译期由初始化器推导类型。经典限制：无初始化不能用、不能 auto 定义数组、不能 Template<auto>；C++20 前也不能作普通函数参数。',
    tags: ['语法', '推导'],
    qaIds: ['yuque_cpp_auto_01'],
    related: ['det_compile_pipeline', 'det_lambda'],
  },
  {
    id: 'det_inline',
    theme: 'C++基础',
    title: '内联函数',
    content:
      'inline 建议编译器在调用点展开，并允许头文件中多处相同定义。虚函数可声明 inline，但动态派发通常无法真正内联；递归也很难完全内联。',
    tags: ['优化', 'inline'],
    qaIds: ['yuque_cpp_inline_01'],
    related: ['det_compile_pipeline', 'det_vtable'],
  },
  {
    id: 'det_raii_new',
    theme: 'C++基础',
    title: 'new/delete 与 malloc',
    content:
      'new/delete 会调用构造/析构，可重载；malloc/free 只管理原始内存。二者不可混用。多态删除需要虚析构。现代 C++ 优先 RAII/智能指针。',
    tags: ['内存', 'RAII'],
    qaIds: ['yuque_cpp_new_malloc_01'],
    related: ['det_smart_ptr', 'det_mem_layout', 'det_wild_ptr'],
  },
  {
    id: 'det_wild_ptr',
    theme: 'C++基础',
    title: '野指针与悬空引用',
    content:
      '野指针指向非法或已释放地址。避免返回局部变量地址/引用，释放后置空，优先智能指针与明确所有权，降低 use-after-free 风险。',
    tags: ['指针', '安全'],
    qaIds: ['yuque_cpp_wild_ptr_01'],
    related: ['det_ptr_ref', 'det_smart_ptr', 'det_mem_leak'],
  },
  {
    id: 'det_memcpy',
    theme: 'C++基础',
    title: 'memcpy 与 memmove',
    content:
      'memcpy 要求源与目标不重叠；memmove 可处理重叠区域。对非平凡类型对象应使用正确的构造/赋值，而非盲目按字节拷贝。',
    tags: ['内存', 'API'],
    qaIds: ['yuque_cpp_memcpy_01'],
    related: ['det_move_semantics', 'det_pod'],
  },
  {
    id: 'det_inc_ops',
    theme: 'C++基础',
    title: '自增运算符',
    content:
      '前置 ++i 返回左值引用，后置 i++ 返回旧值副本。(i++)++ 对内置类型通常非法；++(++i) 合法。自定义类型取决于运算符重载返回值。',
    tags: ['语法', '运算符'],
    qaIds: ['notes_cpp_inc_01', 'yuque_cpp_pp_inc_01'],
    related: ['det_auto', 'det_atomic'],
  },
  {
    id: 'det_cast',
    theme: 'C++基础',
    title: '四种类型转换',
    content:
      'static_cast 做相关类型显式转换；dynamic_cast 做安全的多态下行转换；const_cast 去/加 const；reinterpret_cast 做底层位模式重解释，最危险。',
    tags: ['类型转换'],
    qaIds: ['yuque_cpp_cast_01'],
    related: ['det_const', 'det_vtable'],
  },
  {
    id: 'det_lambda',
    theme: 'C++基础',
    title: 'Lambda 与闭包',
    content:
      'Lambda 编译为函数对象；捕获列表决定成员如何存储。赋给 std::function 可能触发类型擦除与堆分配。闭包可保存上下文供稍后调用。',
    tags: ['Lambda', '函数对象'],
    qaIds: ['yuque_cpp_lambda_01'],
    related: ['det_fp', 'det_delegate', 'det_auto'],
  },
  {
    id: 'det_name_hide',
    theme: 'C++基础',
    title: '名字隐藏',
    content:
      '派生类同名函数会隐藏基类同名重载集，即使参数列表不同。可用 using 基类声明引入。与 override 虚重写不是同一概念。',
    tags: ['继承', '隐藏'],
    qaIds: ['yuque_cpp_hide_01'],
    related: ['det_overload_override', 'det_vtable'],
  },
  {
    id: 'det_c_string',
    theme: 'C++基础',
    title: 'C 字符串与 std::string',
    content:
      '字符数组轻量但易越界、需手动管理；std::string 管理内存并提供安全接口，可能有 SSO 与堆分配开销。按场景在互操作与安全间取舍。',
    tags: ['字符串'],
    qaIds: ['yuque_cs_char_string_01'],
    related: ['det_raii_new', 'det_mem_layout'],
  },

  // —— 范式 ——
  {
    id: 'det_fp',
    theme: '编程范式',
    title: '函数式编程',
    content:
      '强调纯函数、不可变数据与高阶函数组合。C++ 可用 lambda、algorithm/ranges 部分实践；游戏中适合变换管线，热路径需权衡分配与状态。',
    tags: ['范式', 'FP'],
    qaIds: ['notes_fp_01'],
    related: ['det_lambda', 'det_delegate'],
  },

  // —— OOP ——
  {
    id: 'det_vtable',
    theme: '面向对象与多态',
    title: '虚表与动态多态',
    content:
      '动态多态靠虚函数：对象含 vptr，指向类的 vtable，运行时查表派发。多继承可能有多个 vptr/多张虚表。虚表多在只读数据段，vptr 在构造时设置。',
    tags: ['多态', '虚表'],
    qaIds: ['notes_cpp_polymorphism_01', 'yuque_oop_vtable_01', 'yuque_oop_static_dynamic_poly_01', 'yuque_oop_call_cost_01'],
    related: ['det_virtual_dtor', 'det_pure_virtual', 'det_object_layout', 'det_inline'],
  },
  {
    id: 'det_virtual_dtor',
    theme: '面向对象与多态',
    title: '构造析构与虚函数',
    content:
      '构造函数不能为虚；多态基类析构应为虚。构造/析构期间调用虚函数按“当前层”绑定，不会派发到已销毁或未构造完的更派生类。',
    tags: ['虚析构', '易错'],
    qaIds: ['notes_cpp_dtor_virtual_01', 'notes_cpp_bar_foo_01', 'yuque_oop_ctor_dtor_virtual_01'],
    related: ['det_vtable', 'det_raii_new'],
  },
  {
    id: 'det_pure_virtual',
    theme: '面向对象与多态',
    title: '纯虚函数与抽象类',
    content:
      '纯虚函数 `= 0` 使类成为抽象类，不能实例化，用于定义接口并强制派生类实现。可提供纯虚函数的默认实现，但仍须派生类覆盖才能实例化。',
    tags: ['抽象类', '接口'],
    qaIds: ['yuque_oop_pure_virtual_01'],
    related: ['det_vtable', 'det_overload_override'],
  },
  {
    id: 'det_overload_override',
    theme: '面向对象与多态',
    title: '重载与重写',
    content:
      '重载是同名不同参数的静态选择；重写是派生类覆盖基类虚函数的动态派发。仅返回值不同不能构成重载；引用/指针/const 限定会影响重载集合。',
    tags: ['重载', '重写'],
    qaIds: ['yuque_oop_overload_override_01'],
    related: ['det_vtable', 'det_name_hide', 'det_const'],
  },

  // —— OS ——
  {
    id: 'det_process_thread',
    theme: '操作系统',
    title: '进程与线程',
    content:
      '进程是资源分配单位，线程是调度单位；同进程线程共享地址空间。通信靠共享内存+同步，或管道/队列等。创建线程时 OS 分配栈与线程控制块等。',
    tags: ['进程', '线程'],
    qaIds: ['notes_thread_comm_01', 'yuque_os_process_thread_01', 'yuque_thread_switch_01'],
    related: ['det_deadlock', 'det_sync_primitives', 'det_atomic', 'det_virtual_memory'],
  },
  {
    id: 'det_deadlock',
    theme: '操作系统',
    title: '死锁',
    content:
      '死锁四条件：互斥、占有并等待、不可抢占、循环等待。可通过破坏条件、锁顺序、超时、检测恢复等手段预防或解除。',
    tags: ['并发', '死锁'],
    qaIds: ['yuque_os_deadlock_01'],
    related: ['det_sync_primitives', 'det_process_thread'],
  },
  {
    id: 'det_sync_primitives',
    theme: '操作系统',
    title: '同步原语',
    content:
      '临界区保护临界资源。信号量/互斥锁/读写锁/自旋锁各有场景；自旋适合短临界区，单核上自旋通常无意义。避免在持锁时做耗时 IO。',
    tags: ['同步', '锁'],
    qaIds: ['yuque_os_critical_sem_01'],
    related: ['det_deadlock', 'det_atomic', 'det_process_thread'],
  },
  {
    id: 'det_atomic',
    theme: '操作系统',
    title: '原子操作与内存序',
    content:
      '原子操作不可被中间打断，常靠总线锁/缓存锁与 CPU 指令实现。普通 `i++` 一般非原子。内存序约束多线程可见性与重排，错误使用会导致数据竞争。',
    tags: ['原子', '内存序'],
    qaIds: ['yuque_os_atomic_01'],
    related: ['det_sync_primitives', 'det_smart_ptr', 'det_cache_pseudo'],
  },
  {
    id: 'det_virtual_memory',
    theme: '操作系统',
    title: '虚拟内存与缺页',
    content:
      '程序看到的是虚拟地址，经页表映射到物理页。缺页时 OS 分配/换入页面。减少缺页靠局部性、预取、合适的工作集与避免抖动。',
    tags: ['虚拟内存', '缺页'],
    qaIds: ['yuque_os_vm_page_01'],
    related: ['det_mem_layout', 'det_cache_pseudo', 'det_compile_pipeline'],
  },

  // —— STL ——
  {
    id: 'det_rbtree_map',
    theme: 'STL与数据结构',
    title: '红黑树与 map',
    content:
      '红黑树通过染色与旋转保持近似平衡，查找/插入/删除 O(log n)。std::map/set 常用红黑树以提供有序与稳定对数复杂度；相对 AVL 插入删除旋转更少。',
    tags: ['红黑树', 'map'],
    qaIds: ['notes_tree_app_01', 'notes_rbtree_01', 'notes_map_rbtree_01', 'yuque_rbtree_01', 'yuque_stl_map_umap_01', 'yuque_tree_is_graph_01', 'yuque_full_bin_tree_depth_01'],
    related: ['det_hash', 'det_vector_list', 'det_graph'],
  },
  {
    id: 'det_hash',
    theme: 'STL与数据结构',
    title: '哈希表与 unordered_map',
    content:
      '哈希表平均 O(1)，冲突用拉链或开放寻址。unordered_map 自定义键需提供哈希与相等。装载因子过高需扩容；最坏可能退化，有序需求仍用 map。',
    tags: ['哈希', 'unordered_map'],
    qaIds: ['yuque_hash_01', 'yuque_umap_custom_key_01'],
    related: ['det_rbtree_map', 'det_unity_misc'],
  },
  {
    id: 'det_vector_list',
    theme: 'STL与数据结构',
    title: 'vector 与 list',
    content:
      'vector 连续内存、随机访问快、扩容可能失效迭代器；list 节点分散、插入删除稳定但局部性差。reserve/resize、size/capacity 语义不同。',
    tags: ['vector', 'list'],
    qaIds: ['yuque_vector_list_01', 'yuque_array_list_locality_01', 'yuque_iterator_01', 'yuque_data_struct_design_01', 'yuque_queue_circular_01'],
    related: ['det_move_semantics', 'det_rbtree_map', 'det_cache_pseudo'],
  },
  {
    id: 'det_graph',
    theme: 'STL与数据结构',
    title: '图的存储与遍历',
    content:
      '邻接矩阵适合稠密图；邻接表适合稀疏图。BFS 用队列求无权最短路，DFS 用栈/递归。判环可用染色或拓扑；Dijkstra 处理非负权。',
    tags: ['图', 'BFS', 'DFS'],
    qaIds: ['yuque_graph_adj_01', 'yuque_bfs_dfs_01'],
    related: ['det_rbtree_map', 'det_astar'],
  },

  // —— 算法 ——
  {
    id: 'det_sort',
    theme: '算法',
    title: '排序算法',
    content:
      '快排平均 O(n log n)，最坏 O(n²)，可用三数取中/随机化改善；不稳定。归并稳定 O(n log n) 需额外空间；堆排序原地但不稳定。工程库常混合策略。',
    tags: ['排序'],
    qaIds: ['yuque_sort_01'],
    related: ['det_topk', 'det_vector_list'],
  },
  {
    id: 'det_topk',
    theme: '算法',
    title: 'TopK 与选择',
    content:
      '找第 K 大可用大小为 K 的堆 O(n log K)，或快速选择平均 O(n)。中位数是特殊的选择问题。注意重复元素与稳定性需求。',
    tags: ['堆', '选择'],
    qaIds: ['yuque_topk_01'],
    related: ['det_sort', 'det_algo_misc'],
  },
  {
    id: 'det_algo_misc',
    theme: '算法',
    title: '常见手撕题',
    content:
      '面经高频包括链表判环、二叉树序列化、LRU、零钱兑换、最小覆盖子串、通配符匹配、充值档位背包等，考查数据结构组合与 DP/双指针。',
    tags: ['手撕', '面试'],
    qaIds: [
      'notes_algo_recharge_01',
      'yuque_algo_misc_01',
      'yuque_lrucache_01',
      'yuque_pattern_match_dp_01',
      'yuque_serialize_tree_01',
      'yuque_coin_change_01',
      'yuque_list_cycle_01',
      'yuque_min_window_substr_01',
    ],
    related: ['det_topk', 'det_rbtree_map', 'det_hash'],
  },

  // —— 智能指针 ——
  {
    id: 'det_smart_ptr',
    theme: '智能指针与内存',
    title: '智能指针',
    content:
      'unique_ptr 独占；shared_ptr 引用计数共享；weak_ptr 不增强引用、可破环。控制块存计数与删除器。多线程下控制块计数原子，但对象访问仍需同步。',
    tags: ['智能指针', 'RAII'],
    qaIds: ['notes_cpp_smartptr_01', 'yuque_smart_ptr_01', 'yuque_shared_thread_safe_01', 'yuque_unique_destroy_01'],
    related: ['det_raii_new', 'det_mem_leak', 'det_move_semantics', 'det_atomic'],
  },
  {
    id: 'det_mem_leak',
    theme: '智能指针与内存',
    title: '内存泄漏',
    content:
      '申请的内存未释放即泄漏。C++ 常见于 new 无 delete、环引用；C#/Unity 常见于事件未解绑、静态缓存持有。用 RAII、弱引用与剖析工具排查。',
    tags: ['泄漏', '调试'],
    qaIds: ['yuque_mem_leak_01'],
    related: ['det_smart_ptr', 'det_gc', 'det_wild_ptr'],
  },

  // —— 网络 ——
  {
    id: 'det_tcp_udp',
    theme: '计算机网络',
    title: 'TCP 与 UDP',
    content:
      'TCP 面向连接、可靠有序；UDP 无连接、低延迟。游戏常在 UDP 上自建可靠层。三次握手建立、四次挥手释放。大端/小端影响多字节整数传输。',
    tags: ['TCP', 'UDP'],
    qaIds: ['yuque_net_tcp_udp_01', 'yuque_net_endian_01'],
    related: ['det_net_sync', 'det_float_fixed'],
  },
  {
    id: 'det_net_sync',
    theme: '计算机网络',
    title: '帧同步与状态同步',
    content:
      '帧同步传输入、各端确定性模拟，带宽小但对一致性要求高；状态同步传权威状态，易做反外挂但带宽与插值更复杂。选型看品类与延迟。',
    tags: ['同步', '联网'],
    qaIds: ['yuque_net_sync_01'],
    related: ['det_tcp_udp', 'det_float_fixed', 'det_fsm'],
  },

  // —— C# / Unity ——
  {
    id: 'det_csharp_types',
    theme: 'C#与Unity',
    title: '值类型与引用类型',
    content:
      '值类型多在栈/内联存储，赋值拷贝；引用类型在堆上，变量存引用。string 不可变引用类型。struct 不能继承类，可实现接口。',
    tags: ['C#', '类型'],
    qaIds: ['yuque_csharp_value_ref_01', 'yuque_csharp_ref_out_01', 'yuque_csharp_multi_inherit_01', 'yuque_cpp_vs_csharp_mem_01'],
    related: ['det_gc', 'det_mem_layout'],
  },
  {
    id: 'det_gc',
    theme: 'C#与Unity',
    title: 'GC 与装箱',
    content:
      'GC 自动回收堆对象，分代收集减少扫描成本。装箱把值类型包装成引用类型会产生堆分配。Unity 需关注临时 List/字符串/闭包造成的 GC Alloc。',
    tags: ['GC', 'Unity'],
    qaIds: ['yuque_csharp_gc_01'],
    related: ['det_csharp_types', 'det_mem_leak', 'det_coroutine'],
  },
  {
    id: 'det_delegate',
    theme: 'C#与Unity',
    title: '委托与事件',
    content:
      'delegate 是类型安全的函数指针；event 限制外部只能 +=/-=。Action/Func 是常用泛型委托。事件解耦发布订阅，避免直接硬编码调用。',
    tags: ['委托', '事件'],
    qaIds: ['yuque_csharp_delegate_01', 'yuque_closure_01'],
    related: ['det_observer', 'det_lambda', 'det_gc'],
  },
  {
    id: 'det_coroutine',
    theme: 'C#与Unity',
    title: '协程与生命周期',
    content:
      'Unity 协程由迭代器在 PlayerLoop 中分帧推进，不是多线程。Update/FixedUpdate/LateUpdate 分别服务逻辑、物理与相机/后续表现。',
    tags: ['协程', '生命周期'],
    qaIds: ['yuque_unity_coroutine_01', 'yuque_unity_lifecycle_01'],
    related: ['det_gc', 'det_fsm', 'det_burst'],
  },
  {
    id: 'det_burst',
    theme: 'C#与Unity',
    title: 'Burst 与 Job System',
    content:
      'Burst 把 HPC# 子集编译为高效原生代码，常配合 Job System 做多线程数据并行。相对解释/IL 路径可显著加速数值与批处理逻辑。',
    tags: ['Burst', '性能'],
    qaIds: ['yuque_unity_burst_01'],
    related: ['det_coroutine', 'det_cache_pseudo'],
  },
  {
    id: 'det_csharp_generic',
    theme: 'C#与Unity',
    title: 'C# 泛型',
    content:
      'C# 泛型在运行时为引用类型共享实现、为值类型按需特化，避免 Java 式类型擦除带来的装箱。约束与 where 子句限制类型参数能力。',
    tags: ['泛型'],
    qaIds: ['yuque_csharp_generic_01'],
    related: ['det_csharp_types', 'det_unity_misc', 'det_hash'],
  },
  {
    id: 'det_unity_misc',
    theme: 'C#与Unity',
    title: 'UGUI / xLua / Dictionary',
    content:
      'UGUI 按钮通过 EventSystem 与射线/图形射线检测触发回调。xLua 以桥接调用 C#。Dictionary 基于哈希表，需合理的 GetHashCode/Equals。',
    tags: ['Unity', '工具'],
    qaIds: ['yuque_ugui_button_01', 'yuque_xlua_01', 'yuque_cs_dictionary_01'],
    related: ['det_hash', 'det_delegate', 'det_ui_mvvm'],
  },

  // —— 设计模式 ——
  {
    id: 'det_singleton',
    theme: '设计模式',
    title: '单例模式',
    content:
      '保证全局唯一实例。饿汉线程安全；懒汉需加锁或静态初始化。相对静态类，单例可实现接口、控制初始化时机并参与依赖注入。',
    tags: ['单例'],
    qaIds: ['yuque_dp_singleton_01'],
    related: ['det_static', 'det_observer'],
  },
  {
    id: 'det_observer',
    theme: '设计模式',
    title: '观察者模式',
    content:
      '主题维护观察者列表，状态变化时通知。游戏中用于成就、UI 刷新、任务进度等解耦。注意反注册，避免泄漏与已销毁对象回调。',
    tags: ['观察者'],
    qaIds: ['yuque_dp_observer_01'],
    related: ['det_delegate', 'det_singleton', 'det_ui_mvvm'],
  },
  {
    id: 'det_dp_others',
    theme: '设计模式',
    title: '常用设计模式',
    content:
      '工厂/模板方法/装饰器/对象池等解决创建、算法骨架、动态叠加行为与频繁分配。武器系统可用策略或组件组合表达差异与加成。',
    tags: ['模式'],
    qaIds: ['yuque_dp_others_01', 'yuque_weapon_pattern_01'],
    related: ['det_observer', 'det_ecs_pool', 'det_fsm'],
  },

  // —— 渲染 ——
  {
    id: 'det_render_pipeline',
    theme: '渲染与图形',
    title: '渲染管线',
    content:
      '几何阶段到光栅化再到片元测试/混合。顶点/片元着色器分工不同；深度测试与透明度测试发生在片元处理相关阶段，顺序影响正确性与性能。',
    tags: ['管线', '着色器'],
    qaIds: ['yuque_render_pipeline_01', 'yuque_render_coord_normal_01'],
    related: ['det_lighting', 'det_forward_deferred', 'det_drawcall'],
  },
  {
    id: 'det_lighting',
    theme: '渲染与图形',
    title: '光照与 PBR',
    content:
      'Phong/Blinn-Phong 用经验高光；PBR 基于微表面，常用金属度/粗糙度/法线等参数。Mipmap 按脚印大小选级，减轻闪烁与带宽。',
    tags: ['光照', 'PBR'],
    qaIds: ['yuque_render_light_01', 'yuque_render_mipmap_01', 'yuque_render_aa_gamma_01'],
    related: ['det_render_pipeline', 'det_math_vector'],
  },
  {
    id: 'det_forward_deferred',
    theme: '渲染与图形',
    title: '前向与延迟渲染',
    content:
      '前向按物体×灯光着色，半透明友好；延迟先写 GBuffer 再光照，适合多灯，但对 MSAA/透明更麻烦。URP/HDRP 有不同默认路径。',
    tags: ['渲染路径'],
    qaIds: ['yuque_render_forward_deferred_01'],
    related: ['det_render_pipeline', 'det_drawcall'],
  },
  {
    id: 'det_drawcall',
    theme: '渲染与图形',
    title: 'DrawCall 与合批',
    content:
      'DrawCall 是 CPU 提交一次绘制的开销点。通过静态/动态合批、GPU Instancing、SRP Batcher 减少状态切换与提交次数。',
    tags: ['DrawCall', '优化'],
    qaIds: ['yuque_render_drawcall_01'],
    related: ['det_render_pipeline', 'det_forward_deferred'],
  },

  // —— 物理 ——
  {
    id: 'det_collision',
    theme: '物理与碰撞',
    title: '碰撞检测',
    content:
      'AABB 轴对齐、OBB 可旋转。SAT 用分离轴测凸包相交。高速物体需连续检测/扫掠防隧穿。BVH/KD-Tree/SAP 用于宽相加速。',
    tags: ['碰撞', 'BVH'],
    qaIds: ['yuque_phys_aabb_obb_sat_01', 'yuque_bvh_kdtree_01'],
    related: ['det_math_vector', 'det_fsm'],
  },

  // —— 数学 ——
  {
    id: 'det_math_vector',
    theme: '数学与几何',
    title: '向量与旋转',
    content:
      '点乘得投影/夹角，叉乘得垂直方向与面积朝向。四元数避免万向节死锁，适合插值；欧拉角直观但有奇异点。平移不是线性变换，旋转缩放是。',
    tags: ['向量', '四元数'],
    qaIds: ['yuque_math_dot_cross_01', 'yuque_math_quat_01', 'yuque_math_transform_linear_01', 'yuque_projectile_parabola_01'],
    related: ['det_collision', 'det_render_pipeline', 'det_lighting'],
  },
  {
    id: 'det_complement',
    theme: '数学与体系结构',
    title: '补码与移位',
    content:
      '有符号整数用补码统一加减法；-1 为全 1。算术右移保留符号位，逻辑右移补 0。理解位宽与溢出对底层与网络协议很重要。',
    tags: ['补码', '位运算'],
    qaIds: ['yuque_math_complement_01'],
    related: ['det_float_fixed', 'det_cpu_bits'],
  },
  {
    id: 'det_float_fixed',
    theme: '数学与体系结构',
    title: '浮点与定点',
    content:
      '浮点范围大但有精度误差；定点用整数模拟小数，确定性更好，帧同步常用。跨平台需统一溢出与舍入规则。',
    tags: ['定点', '帧同步'],
    qaIds: ['yuque_float_fixed_01'],
    related: ['det_net_sync', 'det_complement', 'det_tcp_udp'],
  },

  // —— 游戏工程 ——
  {
    id: 'det_ecs_pool',
    theme: '游戏工程',
    title: 'ECS 与对象池',
    content:
      'ECS 用紧凑数组存组件以利缓存；频繁增删可用 swap-remove/世代索引。对象池复用实例减分配，需设定上限与淘汰策略。',
    tags: ['ECS', '对象池'],
    qaIds: ['yuque_game_ecs_pool_01'],
    related: ['det_vector_list', 'det_dp_others', 'det_cache_pseudo'],
  },
  {
    id: 'det_fsm',
    theme: '游戏工程',
    title: '角色状态机',
    content:
      '用有限状态机管理 Idle/Run/Jump/Attack 等；输入与动画、物理分离。可变跳跃、土狼时间、贴地检测提升手感。',
    tags: ['状态机', '手感'],
    qaIds: ['yuque_game_fsm_move_01', 'yuque_hitstop_01', 'yuque_hatred_ai_01'],
    related: ['det_coroutine', 'det_collision', 'det_dp_others'],
  },
  {
    id: 'det_ui_mvvm',
    theme: '游戏工程',
    title: 'UI 与 MVVM',
    content:
      'UI 栈/队列管理界面层级；MVVM 用数据绑定减少手动刷新。换皮与网游背包需区分视图状态与服务器权威数据。',
    tags: ['UI', 'MVVM'],
    qaIds: ['yuque_game_ui_mvvm_01', 'yuque_mvvm_hp_dep_01'],
    related: ['det_observer', 'det_delegate', 'det_unity_misc'],
  },
  {
    id: 'det_astar',
    theme: '游戏工程',
    title: '寻路与关卡系统',
    content:
      'A* 用 open/close 集在图上启发式搜索。资源打包注意共用依赖去重；箱庭/炸弹人等关卡需清晰的格子碰撞与范围查询结构。',
    tags: ['A*', '关卡'],
    qaIds: ['yuque_game_ab_path_01', 'yuque_bomb_map_design_01'],
    related: ['det_graph', 'det_collision', 'det_ecs_pool'],
  },

  // —— 工具 / 体系 / AI ——
  {
    id: 'det_tool_editor',
    theme: '工具开发',
    title: '编辑器体验与性能',
    content:
      '好用的编辑器路径短、反馈快、可撤销。需埋点收集操作与卡顿；偶发路径用场景回放/采样剖析，而不是只测平均帧时。',
    tags: ['工具', '性能'],
    qaIds: ['yuque_tool_editor_01'],
    related: ['det_debug_method', 'det_drawcall'],
  },
  {
    id: 'det_cache_pseudo',
    theme: '体系结构',
    title: '缓存与伪共享',
    content:
      '多核下同一缓存行被不同核写会伪共享，导致行来回失效。数据结构对齐与填充可缓解。L1 常分离 I-Cache/D-Cache。',
    tags: ['缓存', '多核'],
    qaIds: ['yuque_cache_pseudo_01'],
    related: ['det_atomic', 'det_vector_list', 'det_ecs_pool'],
  },
  {
    id: 'det_cpu_bits',
    theme: '体系结构',
    title: 'CPU 与 OS 位宽',
    content:
      'CPU 位宽与 OS 位宽相关但不是同一概念：64 位 CPU 可跑 32 位 OS/进程；指针大小、用户态地址空间受 OS 与 ABI 影响。',
    tags: ['体系结构'],
    qaIds: ['yuque_cpu_bits_01'],
    related: ['det_complement', 'det_virtual_memory'],
  },
  {
    id: 'det_agent_llm',
    theme: '工程与AI',
    title: 'Agent 与 LLM',
    content:
      'LLM 是模型能力本身；Agent 在此之上加入规划、工具调用与记忆循环，能多步完成任务。工程上要约束工具权限与可观测性。',
    tags: ['AI', 'Agent'],
    qaIds: ['yuque_agent_llm_01'],
    related: ['det_debug_method'],
  },
  {
    id: 'det_debug_method',
    theme: '工程与AI',
    title: '调试方法',
    content:
      '除二分注释外，可用日志、断言、复现用例、隔离模块、内存/性能剖析、版本回滚对比。先稳定复现再缩小范围。',
    tags: ['调试'],
    qaIds: ['yuque_debug_method_01'],
    related: ['det_tool_editor', 'det_mem_leak'],
  },
];
